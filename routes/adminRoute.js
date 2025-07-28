const express = require("express");
const router = express.Router();
const checkRole = require("../security/roleCheck");
const protectRoute = require("../security/Auth");

// Secure this route to admin only
router.get("/admin-dashboard", protectRoute, checkRole("admin"), (req, res) => {
  res.json({ message: "Welcome to the Admin Dashboard" });
});

module.exports = router;
