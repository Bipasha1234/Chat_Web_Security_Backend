const bcrypt = require('bcryptjs');
const Credential = require("../model/credential");
const generateToken = require("../config/utils.js");
const cloudinary = require( "../config/cloudinary.js");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const dotenv = require("dotenv");  
const validator = require("validator");
const logActivity = require('../config/logger.js');
const generateTokens = require('../config/utils.js');

// const PASSWORD_EXPIRY_DAYS = 1 / (24 * 60); // 1 minute expiry for testing

const MAX_FAILED_ATTEMPTS = 10;
const LOCK_TIME = 15 * 60 * 1000;


const PASSWORD_EXPIRY_DAYS = 90; // 90 days expiry
const isPasswordExpired = (lastChanged) => {
  const now = new Date();
  const diff = (now - lastChanged) / (1000 * 60 * 60 * 24);
  return diff > PASSWORD_EXPIRY_DAYS;
};



const isPasswordReused = async (newPassword, history) => {
  for (let old of history) {
    const match = await bcrypt.compare(newPassword, old);
    if (match) return true;
  }
  return false;
};



// Load environment variables
dotenv.config();


const register = async (req, res) => {
  //  console.log("Incoming cookies:", req.cookies);
  const { fullName, email, password, profilePic } = req.body;

  try {
    // Basic field validation
    if (!fullName || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Password length min 8, max 16
    if (password.length < 8 || password.length > 16) {
      return res.status(400).json({ message: "Password must be between 8 and 16 characters" });
    }

    // Password complexity: at least one uppercase, one lowercase, one digit, one special char
    const complexityRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>]).+$/;
    if (!complexityRegex.test(password)) {
      return res.status(400).json({
        message: "Password must contain uppercase, lowercase, number, and special character",
      });
    }

    // Check if user already exists
    const user = await Credential.findOne({ email });
    if (user) {
      return res.status(400).json({ message: "Email already exists" });
    }

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user object
    const newUser = new Credential({
      fullName,
      email,
      password: hashedPassword,
      profilePic: profilePic || "",
       role: 'user',
     
    });

    await newUser.save();

    await logActivity({
  userId: newUser._id,
  action: "register",
  details: { email: newUser.email },
  ip: req.ip,
  userAgent: req.headers["user-agent"],
});


    res.status(201).json({
      message: "User registered successfully",
      _id: newUser._id,
      fullName: newUser.fullName,
      email: newUser.email,
      profilePic: newUser.profilePic,
    });
  } catch (error) {
    // console.log("Error in signup controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};




const loginStep1 = async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await Credential.findOne({ email });

    if (!user) {
      // Log failed login - user not found
      await logActivity({
        userId: null,
        action: "login_failed",
        details: { email, reason: "User not found" },
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });
      return res.status(400).json({ message: "Invalid credentials" });
    }

    if (user.lockUntil && user.lockUntil > Date.now()) {
      // Log account lock event
      await logActivity({
        userId: user._id,
        action: "login_locked",
        details: { email, lockExpires: user.lockUntil },
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });

      const remaining = Math.ceil((user.lockUntil - Date.now()) / 60000);
      return res.status(403).json({ message: `Account locked. Try again in ${remaining} minute(s)` });
    }

    const isCorrect = await bcrypt.compare(password, user.password);
    if (!isCorrect) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;

      if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
        user.lockUntil = new Date(Date.now() + LOCK_TIME);
        await user.save();

        // Log account lock due to failed attempts
        await logActivity({
          userId: user._id,
          action: "login_locked",
          details: { email, lockExpires: user.lockUntil },
          ip: req.ip,
          userAgent: req.headers["user-agent"],
        });

        return res.status(403).json({ message: "Too many failed attempts. Account locked for 15 minutes." });
      }

      await user.save();

      // Log failed login - wrong password
      await logActivity({
        userId: user._id,
        action: "login_failed",
        details: { email, reason: "Wrong password" },
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });

      return res.status(400).json({ message: "Wrong password" });
    }

    if (isPasswordExpired(user.passwordLastChanged)) {
      return res.status(403).json({ message: "Password expired. Please reset your password." });
    }

    user.failedLoginAttempts = 0;
    user.lockUntil = null;

    const code = String(crypto.randomInt(100000, 1000000));
    user.mfaCode = await bcrypt.hash(code, 10);
    user.mfaCodeExpires = Date.now() + 5 * 60 * 1000;

    await user.save();

    // Log successful step 1 login
    await logActivity({
      userId: user._id,
      action: "login_step1_success",
      details: { email },
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: "Your MFA Verification Code",
      text: `Your verification code is: ${code}. It expires in 5 minutes.`,
    });

    res.status(200).json({ mfaRequired: true, message: "MFA code sent to your email" });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ message: "Internal server error" });
  }
};


const verifyMfaCode = async (req, res) => {
  const { email, code } = req.body;
  try {
    const user = await Credential.findOne({ email });
    if (!user) return res.status(400).json({ message: "User not found" });

    if (!user.mfaCode || !user.mfaCodeExpires || Date.now() > user.mfaCodeExpires) {
      return res.status(400).json({ message: "Verification code expired or invalid" });
    }

    const isMatch = await bcrypt.compare(code, user.mfaCode);
    if (!isMatch) return res.status(400).json({ message: "Invalid verification code" });

    user.mfaCode = null;
    user.mfaCodeExpires = null;
    await user.save();

    // Log successful MFA verification (login success)
    await logActivity({
      userId: user._id,
      action: "login_step2_success",
      details: { email },
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    const token = generateToken(user._id, res);

    res.status(200).json({
      message: "Login successful",
      user: {
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        profilePic: user.profilePic || "",
      },
    });
  } catch (err) {
    console.error("MFA error:", err.message);
    res.status(500).json({ message: "Internal server error" });
  }
};



const logout = async (req, res) => {
  try {
    if (req.user) {
      await logActivity({
        userId: req.user._id,
        action: "logout",
        details: {},
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });
    }

    // Clear the JWT cookie properly
    res.cookie("jwt", "", {
      httpOnly: true,
      secure: true,           
      sameSite: "none",       
      maxAge: 0,             
    });

    res.status(200).json({ message: "Logged out successfully" });
  } catch (err) {
    console.error("Logout error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};



const updateProfile = async (req, res) => {
  try {
    const { email, fullName, profilePic } = req.body;
    const userId = req.user._id;

    const updateFields = {};

    // Validate and sanitize email
    if (email) {
      if (!validator.isEmail(email)) {
        return res.status(400).json({ message: "Invalid email format" });
      }

      const existing = await Credential.findOne({ email });
      if (existing && existing._id.toString() !== userId.toString()) {
        return res.status(409).json({ message: "Email already in use" });
      }

      updateFields.email = validator.normalizeEmail(email);
    }

    // Validate full name
    if (fullName) {
      if (!validator.isLength(fullName, { min: 2, max: 50 })) {
        return res.status(400).json({
          message: "Full name must be between 2 and 50 characters",
        });
      }
      updateFields.fullName = validator.escape(fullName.trim());
    }

    // Validate and upload profile picture
    if (profilePic) {
      // Extract MIME type from base64 string
      const mimeTypeMatch = profilePic.match(/^data:(image\/\w+);base64,/);
      const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp"];

      if (!mimeTypeMatch || !allowedMimeTypes.includes(mimeTypeMatch[1])) {
        return res.status(400).json({
          message: "Invalid image type. Only JPG, PNG, or WEBP allowed.",
        });
      }

      try {
        const uploadResponse = await cloudinary.uploader.upload(profilePic, {
          folder: "user_profile_pics",
          transformation: [{ width: 150, height: 150, crop: "fill" }],
          public_id: `profile_${userId}`,
        });

        updateFields.profilePic = uploadResponse.secure_url;
      } catch (cloudinaryError) {
        return res.status(500).json({
          message: "Error uploading profile picture",
          error: cloudinaryError.message,
        });
      }
    }

    if (Object.keys(updateFields).length === 0) {
      return res
        .status(400)
        .json({ message: "No fields provided for update" });
    }

    const updatedUser = await Credential.findByIdAndUpdate(
      userId,
      updateFields,
      { new: true, runValidators: true }
    ).select("-password -__v");

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json(updatedUser);

    await logActivity({
      userId: userId,
      action: "update_profile",
      details: { updatedFields: Object.keys(updateFields) },
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};




const checkAuth = (req, res) => {
  try {
    res.status(200).json(req.user);
  } catch (error) {
    // console.log("Error in checkAuth controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Create transporter
const transporter = nodemailer.createTransport({
  service: "Gmail",
  auth: {
    user: process.env.EMAIL_USER, 
    pass: process.env.EMAIL_PASS, 
  },
});



const forgotPassword = async (req, res) => {
  const { email } = req.body;
  try {
    const user = await Credential.findOne({ email });
    if (!user) return res.status(400).json({ message: "User with this email does not exist" });

    const resetCode = String(crypto.randomInt(100000, 1000000));
    user.resetCode = await bcrypt.hash(resetCode, 10);
    user.resetCodeExpires = Date.now() + 5 * 60 * 1000;

    await user.save();

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: "Password Reset Code",
      text: `Your password reset code is: ${resetCode}. It will expire in 5 minutes`,
    });

    res.status(200).json({ message: "Reset code sent to your email" });
  } catch (err) {
    console.error("Forgot password error:", err.message);
    res.status(500).json({ message: "Internal server error" });
  }
};



const verifyResetCode = async (req, res) => {
  const { email, resetCode } = req.body;
  try {
    const user = await Credential.findOne({ email });
    if (!user) return res.status(400).json({ message: "User not found" });

    if (!user.resetCode || !user.resetCodeExpires || Date.now() > user.resetCodeExpires) {
      return res.status(400).json({ message: "Invalid or expired reset code" });
    }

    const isMatch = await bcrypt.compare(resetCode, user.resetCode);
    if (!isMatch) return res.status(400).json({ message: "Invalid reset code" });

    user.resetCode = null;
    user.resetCodeExpires = null;
    await user.save();

    res.status(200).json({ message: "Code verified. You may now reset your password." });
  } catch (err) {
    console.error("Verify reset code error:", err.message);
    res.status(500).json({ message: "Internal server error" });
  }
};



const resetPassword = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await Credential.findOne({ email });
    if (!user) return res.status(400).json({ message: "User not found" });

    if (await isPasswordReused(password, user.passwordHistory)) {
      return res.status(400).json({ message: "You cannot reuse a previous password" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    user.passwordHistory.push(user.password);
    if (user.passwordHistory.length > 5) user.passwordHistory.shift();

    user.password = hashedPassword;
    user.passwordLastChanged = new Date();

    await user.save();

    await logActivity({
  userId: user._id,
  action: "reset_password",
  details: { email },
  ip: req.ip,
  userAgent: req.headers["user-agent"],
});
    res.status(200).json({ message: "Password reset successfully" });
  } catch (err) {
    console.error("Reset password error:", err.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  register,
  loginStep1,
  logout,
  checkAuth,
  updateProfile,
  forgotPassword,
  resetPassword,
  verifyResetCode,
  verifyMfaCode
};
