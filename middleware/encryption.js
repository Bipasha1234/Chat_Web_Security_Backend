const crypto = require("crypto");

const key = Buffer.from(process.env.SECRET_KEY, "hex");
const iv = Buffer.from(process.env.IV, "hex");

function encrypt(text) {
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(text.toString(), "utf8", "hex");
  encrypted += cipher.final("hex");
  return encrypted;
}

function decrypt(encrypted) {
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

module.exports = { encrypt, decrypt };
