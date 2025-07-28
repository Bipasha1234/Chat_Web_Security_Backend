const express = require("express");
const router = express.Router();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const Tip = require("../model/payment");
const { body, validationResult } = require("express-validator");

const protectRoute = require("../security/Auth");

// Create payment intent - protected and validated
router.post(
  "/create-payment-intent",
  protectRoute,
  [
    body("amount")
      .isFloat({ gt: 0, lt: 10000 })
      .withMessage("Amount must be a positive number less than 10000"),
    body("receiverId")
      .isMongoId()
      .withMessage("Invalid receiver ID"),
  ],
  async (req, res) => {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { amount, receiverId } = req.body;
    const tipperId = req.user._id.toString(); // from token

    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency: "npr",
        metadata: {
          tipperId,
          receiverId,
        },
      });

      res.send({ clientSecret: paymentIntent.client_secret });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to create payment intent" });
    }
  }
);

// Save tip - protected, validated, and prevents duplicate transactionId
router.post(
  "/save-tip",
  protectRoute,
  [
    body("amount")
      .isFloat({ gt: 0, lt: 10000 })
      .withMessage("Amount must be a positive number less than 10000"),
    body("receiverId")
      .isMongoId()
      .withMessage("Invalid receiver ID"),
    body("messageId")
      .optional()
      .isMongoId()
      .withMessage("Invalid message ID"),
    body("transactionId")
      .isString()
      .notEmpty()
      .withMessage("transactionId is required and must be a string"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { receiverId, amount, messageId, transactionId } = req.body;
    const tipperId = req.user._id.toString(); // always from token

    try {
      // Check if this transactionId already exists to prevent replay
      const existingTip = await Tip.findOne({ transactionId });
      if (existingTip) {
        return res.status(409).json({ error: "Duplicate tip detected" });
      }

      const newTip = new Tip({
        tipperId,
        receiverId,
        amount,
        messageId,
        transactionId,  // store transactionId here
      });

      await newTip.save();

      res.status(201).json({ message: "Tip saved successfully", tip: newTip });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to save tip" });
    }
  }
);

// Get tip by messageId - protected with authorization check
router.get("/get-tip/:messageId", protectRoute, async (req, res) => {
  const { messageId } = req.params;

  try {
    const tip = await Tip.findOne({ messageId });

    if (!tip) return res.status(404).json({ message: "No tip found" });

    const userId = req.user._id.toString();

    if (tip.tipperId.toString() !== userId && tip.receiverId.toString() !== userId) {
      return res.status(403).json({ message: "Unauthorized access" });
    }
//avoid sensitive info exposure
    res.json(tip);
  } catch (error) {
    console.error("Error fetching tip:", error);
    res.status(500).json({ error: "Failed to fetch tip" });
  }
});

module.exports = router;
