import express from "express";
import ClientBookingCtrl from "../controllers/clientBooking.controller";

const router = express.Router();

// Public routes for client booking flow
router.get("/listings", ClientBookingCtrl.getAvailableListings);
router.get("/my-bookings", ClientBookingCtrl.getMyBookings);
router.get("/code/:confirmationCode", ClientBookingCtrl.getBookingByCode); // Legacy/Alternative
router.post("/start", ClientBookingCtrl.startBooking);

// Multi-step booking paths
router.post("/:bookingId/tickets", ClientBookingCtrl.selectTickets);
router.post("/:bookingId/attendees", ClientBookingCtrl.addAttendees);
router.post("/:bookingId/customer-info", ClientBookingCtrl.addCustomerInfo);
router.post("/:bookingId/confirm", ClientBookingCtrl.confirmBooking);
router.post("/:bookingId/payment", ClientBookingCtrl.processPayment);

// Booking management
router.get("/:bookingId", ClientBookingCtrl.getBookingDetails);
router.post("/:bookingId/cancel", ClientBookingCtrl.cancelBooking);

export default router;
