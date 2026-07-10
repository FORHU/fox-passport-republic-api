import express from "express";
import PaymentCtrl from "../controllers/payment.controller";
import { authenticate, requireAdmin } from "../middleware/auth.middleware";

const router = express.Router();

// Stripe — webhook must remain public (called by Stripe, not the client)
router.post("/webhook", PaymentCtrl.handleWebhook);

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
router.post("/create", authenticate, PaymentCtrl.createPayment);
router.put("/:id", authenticate, PaymentCtrl.updatePayment);

// Admin only
router.get("/", authenticate, requireAdmin, PaymentCtrl.getAllPayments);

export default router;
