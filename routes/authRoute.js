const express=require("express");
const router=express.Router();

const { loginStep1,register,logout,checkAuth,updateProfile,forgotPassword, resetPassword, verifyResetCode, updateProfileApp, verifyMfaCode } = require("../controller/AuthController");
const  protectRoute  = require("../security/Auth");


router.post("/login", loginStep1)
router.post("/verify-mfa", verifyMfaCode); 
router.post("/register",register)
router.post("/logout",protectRoute,logout)
router.get("/check",protectRoute,checkAuth)
router.put("/update-profile",protectRoute,updateProfile);
router.post("/forgot-password",forgotPassword);
router.post("/verify-reset-code",verifyResetCode);
router.post("/reset-password",resetPassword);
module.exports=router;