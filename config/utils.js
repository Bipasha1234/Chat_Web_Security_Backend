const jwt = require("jsonwebtoken");

const generateTokens = (userId, res) => {
  // Short-lived access token (e.g., 1 hour)
  const accessToken = jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });

  // Long-lived refresh token (e.g., 7 days)
  const refreshToken = jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: "7d",
  });

  // Send access token in HTTP-only cookie
  res.cookie("accessToken", accessToken, {
    maxAge: 60 * 60 * 1000, // 1 hour
    httpOnly: true,
    sameSite: "none",
    secure: true,
  });

  // Send refresh token in HTTP-only cookie
  res.cookie("refreshToken", refreshToken, {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true,
    sameSite: "none",
    secure: true,
  });

  return { accessToken, refreshToken };
};

module.exports = generateTokens;