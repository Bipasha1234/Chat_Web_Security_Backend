const express = require("express");
const router = express.Router();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const Tip = require("../model/payment"); 

const protectRoute = require("../security/Auth");
router.post("/create-payment-intent", async (req, res) => {
  const { amount, tipperId, receiverId } = req.body;

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
});




router.post("/save-tip", protectRoute, async (req, res) => {
  const { receiverId, amount, messageId } = req.body;

  const tipperId = req.user._id;  //  Get from token, not frontend

  try {
    const newTip = new Tip({
      tipperId,
      receiverId,
      amount,
      messageId,
    });

    await newTip.save();

    res.status(201).json({ message: "Tip saved successfully", tip: newTip });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to save tip" });
  }
});

router.get("/get-tip/:messageId", protectRoute, async (req, res) => {
  const { messageId } = req.params;

  try {
    const tip = await Tip.findOne({ messageId });

    if (!tip) return res.status(404).json({ message: "No tip found" });

    const userId = req.user._id.toString();

    if (tip.tipperId.toString() !== userId && tip.receiverId.toString() !== userId) {
      return res.status(403).json({ message: "Unauthorized access" });
    }

    res.json(tip);
  } catch (error) {
    console.error("Error fetching tip:", error);
    res.status(500).json({ error: "Failed to fetch tip" });
  }
});


module.exports = router;
