const mongoose = require("mongoose");
require("dotenv").config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    // console.log(" MongoDB Connected");
  } catch (e) {
    console.error("MongoDB not connected:", e.message);
  }
};

module.exports = connectDB;
