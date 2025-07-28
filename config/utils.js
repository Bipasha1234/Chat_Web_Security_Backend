// utils/generateToken.js or similar
const jwt = require("jsonwebtoken");

const generateToken = (user, res) => {
  const token = jwt.sign(
    { userId: user._id, role: user.role }, 
    process.env.JWT_SECRET,
    {
      expiresIn: "7d",
    }
  );

  res.cookie("jwt", token, {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV !== "development",
  });

  return token;
};

module.exports = generateToken;
