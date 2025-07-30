const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
    },
    fullName: {
      type: String,
      required: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },

     role: {
    type: String,
    enum: ['user', 'admin'], 
    default: 'user',
  },
    profilePic: {
      type: String,
      default: "",
    },
    blockedUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "creds"
      }
    ],
    resetCode: {
      type: String,
      default: null,
    },
    resetCodeExpires: {
      type: Date,
      default: null,
    },
    failedLoginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: {
      type: Date,
      default: null,
    },

    // In your Credential mongoose schema add:
mfaCode: { type: String },
mfaCodeExpires: { type: Date },
passwordHistory: [{ type: String }], // Store hashes of old passwords
  passwordLastChanged: { type: Date, default: Date.now },
  },

  
  { timestamps: true }
);

const User = mongoose.model("creds", userSchema);

module.exports = User;
