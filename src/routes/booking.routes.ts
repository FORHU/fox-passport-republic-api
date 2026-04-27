import express from "express";
import BookingCtrl from "../controllers/booking.controller";
import AttendeeCtrl from "../controllers/attendee.controller";
import { authenticate, optionalAuth } from "../middleware/auth.middleware";

const router = express.Router();

// ========== MULTI-STEP BOOKING ROUTES ==========
router.post("/draft", authenticate, BookingCtrl.createDraftBooking);                    // Step 1: Create draft

// ========== GUEST MANAGEMENT ROUTES ==========
router.post("/:id/finalize", authenticate, BookingCtrl.finalizeGuests);
router.post("/:bookingId/attendees", authenticate, AttendeeCtrl.addGuest);
router.delete("/attendees/:id", authenticate, AttendeeCtrl.removeGuest);
router.patch("/attendees/:id/respond", optionalAuth, AttendeeCtrl.respondToInvite);

// ========== STANDARD BOOKING CRUD ROUTES ==========
router.get("/", BookingCtrl.getAllBookings);
router.get("/user/:userId", authenticate, BookingCtrl.getUserBookings);
router.get("/:id", optionalAuth, BookingCtrl.getBookingById);
router.post("/create", authenticate, BookingCtrl.createBooking);

export default router;