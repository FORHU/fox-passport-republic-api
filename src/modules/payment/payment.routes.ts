import express from "express";
import { asyncHandler } from "../../utils/async-handler";
import PaymentCtrl from "./payment.controller";
import {
  authenticate,
  requirePermission,
} from "../../middleware/auth.middleware";

const router = express.Router();

// Stripe — webhook must remain public (called by Stripe, not the client).
// asyncHandler: a thrown failure must answer 5xx so Stripe retries, not hang.
router.post("/webhook", asyncHandler(PaymentCtrl.handleWebhook));

// Authenticated
router.post("/create-intent", authenticate, PaymentCtrl.createPaymentIntent);
router.get(
  "/transaction/:transactionId",
  authenticate,
  PaymentCtrl.getPaymentByTransactionId,
);
router.get("/booking/:bookingId", authenticate, PaymentCtrl.getBookingPayments);
router.get(
  "/booking/:bookingId/balance",
  authenticate,
  PaymentCtrl.getRemainingBalance,
);
// Hand-written payment records. These used to need only a sign-in, so any
// user could mark anyone's payment refunded or add one to any booking. Stripe's
// webhook writes the real ones; these are admin bookkeeping.
router.post(
  "/create",
  authenticate,
  requirePermission("payments:manage"),
  PaymentCtrl.createPayment,
);
router.put(
  "/:id",
  authenticate,
  requirePermission("payments:manage"),
  PaymentCtrl.updatePayment,
);

// Admin only
router.get(
  "/",
  authenticate,
  requirePermission("payments:read:all"),
  PaymentCtrl.getAllPayments,
);

export default router;
