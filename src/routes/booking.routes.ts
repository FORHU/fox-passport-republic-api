import express from "express";
import BookingCtrl from "../controllers/booking.controller";

const router = express.Router();

// ========== MULTI-STEP BOOKING ROUTES (DISABLED) ==========
// TODO: Uncomment when multi-step booking is implemented
/*
router.post("/draft", BookingCtrl.createDraftBooking);                    // Step 1: Create draft
router.patch("/:id/tickets", BookingCtrl.updateDraftTickets);             // Step 2: Update tickets
router.patch("/:id/customer-info", BookingCtrl.updateDraftCustomerInfo);  // Step 3: Customer info
router.post("/:id/confirm", BookingCtrl.confirmDraftBooking);             // Step 4: Confirm booking
*/

// ========== STANDARD BOOKING CRUD ROUTES ==========
router.get("/", BookingCtrl.getAllBookings);
router.get("/confirmation/:code", BookingCtrl.getBookingByConfirmationCode);  // MOVED UP to avoid conflict
router.get("/user/:userId", BookingCtrl.getUserBookings);
router.get("/event/:eventId", BookingCtrl.getEventBookings);
router.get("/:id", BookingCtrl.getBookingById);                              // MOVED DOWN to avoid conflict
router.post("/create", BookingCtrl.createBooking);                           // Single-step booking (legacy)
router.put("/:id", BookingCtrl.updateBooking);
router.delete("/:id", BookingCtrl.deleteBooking);

export default router;