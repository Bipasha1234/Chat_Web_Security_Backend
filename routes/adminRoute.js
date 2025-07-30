const express = require("express");
const router = express.Router();
const authorizeRoles = require("../security/roleCheck");
const protectRoute = require("../security/Auth");

// Secure this route to admin only
router.get(
  "/admin-dashboard",
  protectRoute,
  authorizeRoles("admin"),
  (req, res) => {
    res.json({ message: "Welcome Admin", user: req.user });
  }
);

module.exports = router;
