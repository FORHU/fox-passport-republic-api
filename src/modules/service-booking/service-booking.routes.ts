import express from "express";
import ServiceBookingCtrl from "./service-booking.controller";
import { authenticate, optionalAuth } from "../../middleware/auth.middleware";

const router = express.Router();

// Public — availability check (must be before /:id)
router.get("/availability", ServiceBookingCtrl.getAvailability);

// Public — list bookings (filtered by ?userId or ?ownerId)
router.get("/", optionalAuth, ServiceBookingCtrl.getAll);

// Public — single booking detail
router.get("/:id", optionalAuth, ServiceBookingCtrl.getById);

// Protected — create a booking
router.post("/", authenticate, ServiceBookingCtrl.create);

// Protected — confirm payment after Stripe redirect
router.post("/:id/confirm", authenticate, ServiceBookingCtrl.confirmPayment);

// Protected — provider or booker updates status (e.g. active, completed)
router.patch("/:id/status", authenticate, ServiceBookingCtrl.updateStatus);

// Protected — cancel booking
router.delete("/:id", authenticate, ServiceBookingCtrl.cancel);

// Protected — client confirms provider arrived (releases escrow)
router.patch(
  "/:id/confirm-arrival",
  authenticate,
  ServiceBookingCtrl.confirmArrival,
);

// Protected — client reports no-show / problem (disputes escrow)
router.patch("/:id/dispute", authenticate, ServiceBookingCtrl.dispute);

export default router;
