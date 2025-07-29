const jwt = require("jsonwebtoken");

const generateTokens = async (user, res) => {
  const accessToken = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });

  const refreshToken = jwt.sign({ userId: user._id }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: "7d",
  });

  // Store refresh token in DB for revocation management
  user.refreshTokens.push(refreshToken);
  await user.save();

  // Set cookies as before
  res.cookie("accessToken", accessToken, {
    maxAge: 60 * 60 * 1000, // 1 hour
    httpOnly: true,
    sameSite: "none",
    secure: true,
  });

  res.cookie("refreshToken", refreshToken, {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true,
    sameSite: "none",
    secure: true,
  });

  return { accessToken, refreshToken };
};

module.exports = generateTokens;