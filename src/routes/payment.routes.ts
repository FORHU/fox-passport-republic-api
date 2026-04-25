import express from "express";
import PaymentCtrl from "../controllers/payment.controller";

const router = express.Router();

// Payment routes
router.get("/", PaymentCtrl.getAllPayments);
router.get("/:id", PaymentCtrl.getPaymentById);
router.get("/transaction/:transactionId", PaymentCtrl.getPaymentByTransactionId);
router.get("/booking/:bookingId", PaymentCtrl.getBookingPayments);
router.get("/booking/:bookingId/balance", PaymentCtrl.getRemainingBalance);
router.post("/create", PaymentCtrl.createPayment);
router.put("/:id", PaymentCtrl.updatePayment);

export default router;
