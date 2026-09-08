import express from "express";
import AssetBookingCtrl from "./asset-booking.controller";
import { authenticate, optionalAuth } from "../../middleware/auth.middleware";

const router = express.Router();

// Public — availability check (must be before /:id)
router.get("/availability", AssetBookingCtrl.getAvailability);

// Public — list bookings (filtered by ?userId or ?ownerId)
router.get("/", optionalAuth, AssetBookingCtrl.getAll);

// Public — single booking detail
router.get("/:id", optionalAuth, AssetBookingCtrl.getById);

// Protected — create a booking
router.post("/", authenticate, AssetBookingCtrl.create);

// Protected — confirm payment after Stripe redirect
router.post("/:id/confirm", authenticate, AssetBookingCtrl.confirmPayment);

// Protected — provider or booker updates status (e.g. active, returned)
router.patch("/:id/status", authenticate, AssetBookingCtrl.updateStatus);

// Protected — cancel booking
router.delete("/:id", authenticate, AssetBookingCtrl.cancel);

// Protected — client confirms equipment received (releases escrow)
router.patch(
  "/:id/confirm-arrival",
  authenticate,
  AssetBookingCtrl.confirmArrival,
);

// Protected — client reports no-show / problem (disputes escrow)
router.patch("/:id/dispute", authenticate, AssetBookingCtrl.dispute);

export default router;
