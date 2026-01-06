import express from "express";
import ClientBookingCtrl from "../controllers/clientBooking.controller";

const router = express.Router();

console.log("í¿¢ Client booking routes loaded!");

// ========== SPECIFIC ROUTES FIRST ==========
// (Must come BEFORE any /:bookingId routes)

router.get("/test", (req, res) => {
    res.json({ 
        success: true, 
        message: "Client booking routes are working!",
        timestamp: new Date()
    });
});

router.get("/events", ClientBookingCtrl.getAvailableEvents);
router.get("/my-bookings", ClientBookingCtrl.getMyBookings);
router.get("/code/:confirmationCode", ClientBookingCtrl.getBookingByCode);

// ========== BOOKING FLOW ==========

router.post("/start", ClientBookingCtrl.startBooking);
router.post("/:bookingId/tickets", ClientBookingCtrl.selectTickets);
router.post("/:bookingId/customer-info", ClientBookingCtrl.addCustomerInfo);
router.post("/:bookingId/confirm", ClientBookingCtrl.confirmBooking);
router.post("/:bookingId/cancel", ClientBookingCtrl.cancelBooking);

// ========== DYNAMIC ROUTE (MUST BE LAST) ==========

router.get("/:bookingId", ClientBookingCtrl.getBookingDetails);

export default router;
