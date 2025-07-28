const express = require("express");
const router = express.Router();
const Credential = require("../model/credential");
const Message = require("../model/message");
const Group = require("../model/group");
const Tip = require("../model/payment");
const protectRoute = require("../security/Auth");

router.get("/admin-dashboard", protectRoute, async (req, res) => {
  try {
    // Only allow admins
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const [totalUsers, totalAdmins, totalMessages, totalGroups, totalTips] = await Promise.all([
      Credential.countDocuments({ role: "user" }),
      Credential.countDocuments({ role: "admin" }),
      Message.countDocuments(),
      Group.countDocuments(),
      Tip.countDocuments(),
    ]);

    res.json({
      dashboard: {
        totalUsers,
        totalAdmins,
        totalMessages,
        totalGroups,
        totalTips,
      },
    });
  } catch (err) {
    console.error("Error fetching dashboard stats:", err);
    res.status(500).json({ message: "Server Error" });
  }
});

module.exports = router;
