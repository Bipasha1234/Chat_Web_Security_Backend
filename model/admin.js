require("dotenv").config();
const { connect, disconnect } = require("mongoose");
const Credential = require("../model/credential");
const bcrypt = require("bcrypt");

const { MONGO_URI, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

const createAdmin = async () => {
  try {
    await connect(MONGO_URI);

    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);

    const admin = new Credential({
      email: ADMIN_EMAIL,
      fullName: "Admin User",
      password: hashedPassword,
      role: "admin",
    });

    await admin.save();
    console.log("Admin created successfully");
  } catch (err) {
    console.error("Failed to create admin:", err.message);
  } finally {
    await disconnect();
  }
};

createAdmin();
