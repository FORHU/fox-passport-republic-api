import express from "express";
import StripeConnectCtrl from "./stripe-connect.controller";
import {
  authenticate,
  requirePermission,
} from "../../middleware/auth.middleware";

const router = express.Router();

// Only payout-recipient roles can onboard, per ROLE_TYPE_GRANTS in
// types/permissions.ts. Investors are no longer excluded from this: once a
// PartnerInvestment carries a revenueSharePercent, its holder receives real
// investor_revenue_share transfers (PayoutSvc.resolveInvestorSplit) and needs
// a Connect account like any other payout-recipient role.
router.post(
  "/onboard",
  authenticate,
  requirePermission("payouts:onboard"),
  StripeConnectCtrl.createOnboardingLink,
);
router.get("/status", authenticate, StripeConnectCtrl.getStatus);

export default router;
