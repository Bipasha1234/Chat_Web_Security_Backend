const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const PASSWORD_EXPIRY_DAYS = 90;
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
