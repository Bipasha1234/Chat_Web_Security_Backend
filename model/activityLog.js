// models/ActivityLog.js
const mongoose = require("mongoose");

const activityLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "creds", required: true },
  action: { type: String, required: true },          
  details: { type: Object },                          
  ip: { type: String },
  userAgent: { type: String },
  timestamp: { type: Date, default: Date.now },
});

module.exports = mongoose.model("ActivityLog", activityLogSchema);
