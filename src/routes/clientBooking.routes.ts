import express from "express";
import ClientBookingCtrl from "../controllers/clientBooking.controller";

const router = express.Router();

// ========== CLIENT BOOKING FLOW ==========
// Public endpoints for clients to book events

// Browse events
router.get("/events", ClientBookingCtrl.getAvailableEvents);

// Multi-step booking flow
router.post("/start", ClientBookingCtrl.startBooking);                                    // Step 1: Start booking
router.post("/:bookingId/tickets", ClientBookingCtrl.selectTickets);                      // Step 2: Select tickets
router.post("/:bookingId/customer-info", ClientBookingCtrl.addCustomerInfo);              // Step 3: Add info
router.post("/:bookingId/confirm", ClientBookingCtrl.confirmBooking);                     // Step 4: Confirm

// View bookings
router.get("/my-bookings", ClientBookingCtrl.getMyBookings);                              // Get all user bookings
router.get("/:bookingId", ClientBookingCtrl.getBookingDetails);                           // Get specific booking
router.get("/code/:confirmationCode", ClientBookingCtrl.getBookingByCode);                // Lookup by code

// Manage bookings
router.post("/:bookingId/cancel", ClientBookingCtrl.cancelBooking);                       // Cancel booking

export default router;