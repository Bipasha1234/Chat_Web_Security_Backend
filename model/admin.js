require("dotenv").config();
const mongoose = require("mongoose");
const Credential = require("../models/credential");
const bcrypt = require("bcrypt");

// Use .env values
const { MONGO_URI, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const createAdmin = async () => {
  try {
    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);

    const admin = new Credential({
      email: ADMIN_EMAIL,
      fullName: "Admin User",
      password: hashedPassword,
      role: "admin", // Securely assign admin
    });

    await admin.save();
    console.log(" Admin created successfully");
  } catch (err) {
    console.error(" Failed to create admin:", err.message);
  } finally {
    mongoose.disconnect();
  }
};

createAdmin();
