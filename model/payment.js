const mongoose = require("mongoose");

const tipSchema = new mongoose.Schema({
  tipperId: { type: mongoose.Schema.Types.ObjectId, ref: "creds" },
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: "creds" },
  amount: Number,
   messageId: { type: mongoose.Schema.Types.ObjectId, ref: "messages" }, 
  date: { type: Date, default: Date.now },
});

module.exports = mongoose.model("tips", tipSchema);
