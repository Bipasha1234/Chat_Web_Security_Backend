
const bcrypt = require('bcryptjs');
const Credential = require("../model/credential");
const generateToken = require("../config/utils");
const cloudinary = require( "../config/cloudinary.js");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const dotenv = require("dotenv");  // CommonJS for dotenv
// const PASSWORD_EXPIRY_DAYS = 1 / (24 * 60); // 1 minute expiry for testing
const PASSWORD_EXPIRY_DAYS = 90; // 90 days expiry
const MAX_FAILED_ATTEMPTS = 10;
const LOCK_TIME = 15 * 60 * 1000;

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
  const { fullName, email, password, profilePic } = req.body;

  try {
    // Basic field validation
    if (!fullName || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Password length min 8, max 64
    if (password.length < 8 || password.length > 64) {
      return res.status(400).json({ message: "Password must be between 8 and 64 characters" });
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
      // Optionally, add password history and last changed date here
      // passwordHistory: [hashedPassword],
      // passwordLastChangedAt: new Date(),
    });

    await newUser.save();

    res.status(201).json({
      message: "User registered successfully",
      _id: newUser._id,
      fullName: newUser.fullName,
      email: newUser.email,
      profilePic: newUser.profilePic,
    });
  } catch (error) {
    console.log("Error in signup controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

const loginStep1 = async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await Credential.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    if (user.lockUntil && user.lockUntil > Date.now()) {
      const remaining = Math.ceil((user.lockUntil - Date.now()) / 60000);
      return res.status(403).json({ message: `Account locked. Try again in ${remaining} minute(s)` });
    }

    const isCorrect = await bcrypt.compare(password, user.password);
    if (!isCorrect) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
        user.lockUntil = new Date(Date.now() + LOCK_TIME);
        await user.save();
        return res.status(403).json({ message: "Too many failed attempts. Account locked for 15 minutes." });
      }
      await user.save();
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

    const token = generateToken(user._id, res);

    res.status(200).json({
      message: "Login successful",
      token,
      user: {
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        profilePic: user.profilePic || "",
      },
    });
  } catch (err) {
    console.error("MFA error:", err.message);
    res.status(500).json({ message: "Internal server error" });
  }
};



// Logout route (Clear the cookie)
const logout = (req, res) => {
  try {
    res.cookie("jwt", "", { maxAge: 0 });
    res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    console.log("Error in logout controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

const updateProfile = async (req, res) => {
  try {
    const { email, fullName, profilePic } = req.body;
    const userId = req.user._id; // Assuming the user ID is retrieved from authentication middleware

    // Initialize update fields object
    const updateFields = {};

    // Check if profilePic is provided and upload it to Cloudinary
    if (profilePic) {
      try {
        const uploadResponse = await cloudinary.uploader.upload(profilePic, {
          folder: "user_profile_pics", // Optional folder in Cloudinary
          transformation: [{ width: 150, height: 150, crop: "fill" }], // Optional image transformation
        });
        updateFields.profilePic = uploadResponse.secure_url; // Store the Cloudinary URL
      } catch (cloudinaryError) {
        return res.status(500).json({ message: "Error uploading profile picture", error: cloudinaryError.message });
      }
    }

    // Update fields if provided
    if (email) {
      updateFields.email = email;
    }

    if (fullName) {
      updateFields.fullName = fullName;
    }

    // If no fields to update, return a message
    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({ message: "No fields to update" });
    }

    // Update the user profile with the fields that are provided
    const updatedUser = await Credential.findByIdAndUpdate(
      userId,
      updateFields,
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // Return the updated user details as a response
    res.status(200).json(updatedUser);
  } catch (error) {
    console.error("Error in updating profile:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
};


 const uploadImage =  (req, res) => {
  if (!req.file) {
    return res.status(400).send({ message: "Please upload a file" });
  }
  res.status(200).json({
    success: true,
    data: req.file.filename,
  });
}

const checkAuth = (req, res) => {
  try {
    res.status(200).json(req.user);
  } catch (error) {
    console.log("Error in checkAuth controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

const getCurrentUser = async (req, res) => {
  const user = await Credential.findById(req.user._id).select("-password");

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  res.status(200).json(user);
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
  uploadImage,
  getCurrentUser, 
  forgotPassword,
  resetPassword,
  verifyResetCode,
  verifyMfaCode
};
