import express from "express";
import AuthCtrl from "../controllers/auth.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = express.Router();

router.post("/register", AuthCtrl.register);
router.post("/verify-email", AuthCtrl.verifyEmail);
router.post("/login", AuthCtrl.login);
router.post("/logout", AuthCtrl.logout);
router.post("/refresh-token", AuthCtrl.refreshToken);
router.post("/forgot-password", AuthCtrl.forgotPassword);
router.post("/reset-password", AuthCtrl.resetPassword);
router.post("/resend-verification-otp", AuthCtrl.resendVerificationOTP);
router.get("/google", AuthCtrl.googleRedirect);
router.get("/google/callback", AuthCtrl.googleCallback);
router.post("/google/exchange", AuthCtrl.googleExchange);
router.post("/socket-ticket", authenticate, AuthCtrl.socketTicket);

export default router;
