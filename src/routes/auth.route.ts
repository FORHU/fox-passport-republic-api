import express from "express";
import AuthCtrl from "../controllers/auth.controller";

const router = express.Router();

router.post("/register", AuthCtrl.register);
router.post("/verify-email", AuthCtrl.verifyEmail);
router.post("/login", AuthCtrl.login);
router.post("/refresh-token", AuthCtrl.refreshToken);
router.post("/forgot-password", AuthCtrl.forgotPassword);
router.post("/reset-password", AuthCtrl.resetPassword);
router.post("/resend-verification-otp", AuthCtrl.resendVerificationOTP);

export default router;