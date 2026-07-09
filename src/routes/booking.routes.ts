import express from "express";
import BookingCtrl from "../controllers/booking.controller";
import AttendeeCtrl from "../controllers/attendee.controller";
import { authenticate, optionalAuth } from "../middleware/auth.middleware";

const router = express.Router();

// ========== MULTI-STEP BOOKING ROUTES ==========
router.post("/from-template", authenticate, BookingCtrl.bookFromTemplate); // Book directly from an approved template
router.post("/draft", authenticate, BookingCtrl.createDraftBooking); // Step 1: Create draft

// ========== CANCELLATION & REFUND ROUTES ==========
router.post("/:id/cancel/check", authenticate, BookingCtrl.cancelCheck);
router.post("/:id/cancel", authenticate, BookingCtrl.cancelBooking);

// ========== GUEST MANAGEMENT ROUTES ==========
router.post("/:id/finalize", authenticate, BookingCtrl.finalizeGuests);
router.post("/:bookingId/attendees", authenticate, AttendeeCtrl.addGuest);
router.put("/:id/attendees", authenticate, BookingCtrl.appendAttendees);
router.delete("/attendees/:id", authenticate, AttendeeCtrl.removeGuest);
router.patch(
  "/attendees/:id/respond",
  optionalAuth,
  AttendeeCtrl.respondToInvite,
);

// ========== STANDARD BOOKING CRUD ROUTES ==========
router.get("/availability", BookingCtrl.getAvailability); // must be before /:id
router.get("/", BookingCtrl.getAllBookings);
router.get("/upcoming", authenticate, BookingCtrl.getUpcomingBookings); // must be before /:id
router.get("/user/:userId", authenticate, BookingCtrl.getUserBookings);
router.get("/:id", optionalAuth, BookingCtrl.getBookingById);
router.post("/create", authenticate, BookingCtrl.createBooking);
router.post("/:id/confirm", authenticate, BookingCtrl.confirmBooking);

// ========== LIFECYCLE ROUTES (mirrors asset-booking.routes.ts / service-booking.routes.ts) ==========
router.patch("/:id/status", authenticate, BookingCtrl.updateStatus);

router.patch("/:id/confirm-arrival", authenticate, BookingCtrl.confirmArrival);
router.patch("/:id/dispute", authenticate, BookingCtrl.dispute);

export default router;
