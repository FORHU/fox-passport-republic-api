import express from "express";
import BookingCtrl from "../controllers/booking.controller";

const router = express.Router();

// Booking CRUD routes
router.get("/", BookingCtrl.getAllBookings);
router.get("/:id", BookingCtrl.getBookingById);
router.get("/confirmation/:code", BookingCtrl.getBookingByConfirmationCode);
router.get("/user/:userId", BookingCtrl.getUserBookings);
router.get("/event/:eventId", BookingCtrl.getEventBookings);
router.post("/create", BookingCtrl.createBooking);
router.put("/:id", BookingCtrl.updateBooking);
router.delete("/:id", BookingCtrl.deleteBooking);

export default router;
