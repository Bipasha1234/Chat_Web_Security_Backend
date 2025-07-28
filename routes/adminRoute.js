const express = require("express");
const router = express.Router();
const checkRole = require("../security/roleCheck");

// Secure this route to admin only
router.get("/admin-dashboard", checkRole("admin"), (req, res) => {
  res.json({ message: "Welcome to the Admin Dashboard" });
});

module.exports = router;
