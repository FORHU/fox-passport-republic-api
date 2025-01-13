import express from "express";

import AuthCtrl from "../controllers/auth.controller";
import authenticateToken from "../middleware/authenticate-token.middleware";
import suspensionMiddleware from "../middleware/suspension.middleware";
import tenantMiddleware from "../middleware/tenant.middleware";
import sessionMiddleware from "../middleware/valid-session.middleware";
const router = express.Router();

router.post("/login", [suspensionMiddleware], AuthCtrl.loginViaEmail);
router.post("/registration", [tenantMiddleware], AuthCtrl.registrationViaEmail);
router.post("/logout", [sessionMiddleware, authenticateToken], AuthCtrl.logout);
router.get("/google", AuthCtrl.generateGoogleAuthUrl);
router.get("/callback/google", AuthCtrl.googleAuthorization);
router.get("/email-verification", [sessionMiddleware, authenticateToken], AuthCtrl.sendEmailVerification);
router.patch("/validate-email-otp", [sessionMiddleware, authenticateToken], AuthCtrl.validateOtp);
router.patch("/update-password", [sessionMiddleware, authenticateToken], AuthCtrl.updateUserPassword);
router.post("/refresh-token", AuthCtrl.refreshAccessToken);
router.get("/verify-email/:token", AuthCtrl.verifyEmail);
router.post("/account-recovery", AuthCtrl.accountRecovery);
router.patch("/password-reset/:token", AuthCtrl.newPasswordReset);

export default router;
