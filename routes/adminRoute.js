const express = require("express");
const router = express.Router();
const authorizeRoles = require("../security/roleCheck");
const protectRoute = require("../security/Auth");
const ActivityLog = require("../model/activityLog");

// Admin Dashboard
router.get(
  "/admin-dashboard",
  protectRoute,
  authorizeRoles("admin"),
  (req, res) => {
    res.json({ message: "Welcome Admin", user: req.user });
  }
);

// Admin Logs
router.get(
  "/admin-logs",
  protectRoute,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const logs = await ActivityLog.find()
        .populate("userId", "fullName email") // Optional: get user details
        .sort({ timestamp: -1 }); // Sort by latest
      res.status(200).json(logs);
    } catch (err) {
      console.error("Error fetching logs:", err.message);
      res.status(500).json({ message: "Failed to fetch logs" });
    }
  }
);

module.exports = router;
