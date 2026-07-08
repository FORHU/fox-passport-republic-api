import express from "express";
import PaymentCtrl from "../controllers/payment.controller";

const router = express.Router();

// Stripe
router.post("/create-intent", PaymentCtrl.createPaymentIntent);
router.post("/webhook", PaymentCtrl.handleWebhook);

// Payment CRUD
router.get("/", PaymentCtrl.getAllPayments);
router.get(
  "/transaction/:transactionId",
  PaymentCtrl.getPaymentByTransactionId,
);
router.get("/booking/:bookingId", PaymentCtrl.getBookingPayments);
router.get("/booking/:bookingId/balance", PaymentCtrl.getRemainingBalance);
router.post("/create", PaymentCtrl.createPayment);
router.put("/:id", PaymentCtrl.updatePayment);

export default router;
