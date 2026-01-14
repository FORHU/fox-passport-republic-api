import express from "express";
import BookingCtrl from "../controllers/booking.controller";

const router = express.Router();

// ========== MULTI-STEP BOOKING ROUTES ==========
router.post("/draft", BookingCtrl.createDraftBooking);                    // Step 1: Create draft
// router.patch("/:id/tickets", BookingCtrl.updateDraftTickets);             // Step 2: Update tickets - TODO: implement
// router.patch("/:id/customer-info", BookingCtrl.updateDraftCustomerInfo);  // Step 3: Customer info - TODO: implement
// router.post("/:id/confirm", BookingCtrl.confirmDraftBooking);             // Step 4: Confirm booking - TODO: implement

// ========== STANDARD BOOKING CRUD ROUTES ==========
router.get("/", BookingCtrl.getAllBookings);
// router.get("/confirmation/:code", BookingCtrl.getBookingByConfirmationCode);  // TODO: implement
router.get("/user/:userId", BookingCtrl.getUserBookings);
// router.get("/listing/:listingId", BookingCtrl.getListingBookings);  // TODO: implement - use /event/:eventId instead
router.get("/:id", BookingCtrl.getBookingById);                              // MOVED DOWN to avoid conflict
router.post("/create", BookingCtrl.createBooking);                           // Single-step booking (legacy)
// router.put("/:id", BookingCtrl.updateBooking);  // TODO: implement
// router.delete("/:id", BookingCtrl.deleteBooking);  // TODO: implement

export default router;