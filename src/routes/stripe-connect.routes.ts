import express from "express";
import StripeConnectCtrl from "../controllers/stripe-connect.controller";
import { authenticate, requireRole } from "../middleware/auth.middleware";

const router = express.Router();

// Only payout-recipient roles can onboard — investor is excluded (investors fund the
// platform, they don't receive operational payouts in this domain model).
router.post(
  "/onboard",
  authenticate,
  requireRole(["mayor", "host", "foxerAsset", "foxerService"]),
  StripeConnectCtrl.createOnboardingLink
);
router.get("/status", authenticate, StripeConnectCtrl.getStatus);

export default router;
