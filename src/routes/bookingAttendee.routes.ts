import express from "express";
import BookingAttendeeCtrl from "../controllers/bookingAttendee.controller";

const router = express.Router();

// Booking Attendee routes
router.get("/", BookingAttendeeCtrl.getBookingAttendees); // This might need parameters
router.get("/:id", BookingAttendeeCtrl.getAttendeeById);
router.get("/ticket/:ticketCode", BookingAttendeeCtrl.getAttendeeByTicketCode);
router.get("/booking/:bookingId", BookingAttendeeCtrl.getBookingAttendees);
router.get("/event/:eventId", BookingAttendeeCtrl.getEventAttendees); // Corrected route
router.post("/create", BookingAttendeeCtrl.createAttendee);
router.put("/:id", BookingAttendeeCtrl.updateAttendee);
router.put("/:id/checkin", BookingAttendeeCtrl.checkInAttendee);
router.post("/checkin", BookingAttendeeCtrl.checkInByTicketCode);
router.delete("/:id", BookingAttendeeCtrl.deleteAttendee);

export default router;
