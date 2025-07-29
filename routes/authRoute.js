const express=require("express");
const router=express.Router();

const { body, validationResult } = require("express-validator");

const { loginStep1,register,logout,checkAuth,updateProfile,getCurrentUser, forgotPassword, resetPassword, verifyResetCode, updateProfileApp, verifyMfaCode } = require("../controller/AuthController");
const  protectRoute  = require("../security/Auth");


router.post("/login", loginStep1)
router.post("/verify-mfa", verifyMfaCode); 
router.post("/register",register)
router.post("/logout",protectRoute,logout)
router.get("/check",protectRoute,checkAuth)


router.put(
  "/update-profile",
  protectRoute,
  [
    body("email").optional().isEmail().normalizeEmail(),
    body("fullName").optional().isString().trim().escape(),
    body("profilePic").optional().isString(), // e.g., base64 string or image URL
  ],
  (req, res, next) => {
    // Validate the request body
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next(); // continue to updateProfile controller
  },
  updateProfile
);

router.get("/get-user",protectRoute,getCurrentUser);
router.post("/forgot-password",forgotPassword);
router.post("/verify-reset-code",verifyResetCode);
router.post("/reset-password",resetPassword);
module.exports=router;