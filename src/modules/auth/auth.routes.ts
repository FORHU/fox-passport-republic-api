import express from "express";
import AuthCtrl from "./auth.controller";
import { authenticate } from "../../middleware/auth.middleware";
import {
  loginRateLimit,
  registerRateLimit,
  refreshRateLimit,
  otpSendRateLimit,
  otpVerifyRateLimit,
} from "../../middleware/rate-limit.middleware";

const router = express.Router();

// Rate limits sit on the credential endpoints, in front of the controller. The
// app-wide limiter in app.ts is sized for browsing and is off in development;
// these are sized for guessing and stay on. See rate-limit.middleware.ts.
router.post("/register", registerRateLimit, AuthCtrl.register);
router.post("/verify-email", otpVerifyRateLimit, AuthCtrl.verifyEmail);
router.post("/login", loginRateLimit, AuthCtrl.login);
router.post("/logout", AuthCtrl.logout);
router.post("/refresh-token", refreshRateLimit, AuthCtrl.refreshToken);
router.post("/forgot-password", otpSendRateLimit, AuthCtrl.forgotPassword);
router.post("/reset-password", otpVerifyRateLimit, AuthCtrl.resetPassword);
router.post(
  "/resend-verification-otp",
  otpSendRateLimit,
  AuthCtrl.resendVerificationOTP,
);
router.get("/google", AuthCtrl.googleRedirect);
router.get("/google/callback", AuthCtrl.googleCallback);
router.post("/google/exchange", AuthCtrl.googleExchange);
router.post("/socket-ticket", authenticate, AuthCtrl.socketTicket);

export default router;
