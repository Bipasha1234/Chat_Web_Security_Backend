const mongoose = require("mongoose");

const tipSchema = new mongoose.Schema({
  tipperId: { type: mongoose.Schema.Types.ObjectId, ref: "creds" },
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: "creds" },
 amount: { type: String, required: true },

   messageId: { type: mongoose.Schema.Types.ObjectId, ref: "messages" }, 
  date: { type: Date, default: Date.now },
   transactionId: { type: String, required: true, unique: true },  // Add unique transactionId
});

module.exports = mongoose.model("tips", tipSchema);
