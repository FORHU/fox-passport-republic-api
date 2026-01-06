import express from "express";
import authRoute from "../routes/auth.route";
import usersRoute from "../routes/users.route";
import eventRoutes from "../routes/event.routes";
import categoryRoutes from "../routes/category.routes";
import bookingRoutes from "../routes/booking.routes";
import reviewRoutes from "../routes/review.routes";
import favoriteRoutes from "../routes/favorite.routes";
import paymentRoutes from "../routes/payment.routes";
import bookingAttendeeRoutes from "../routes/bookingAttendee.routes";
import clientBookingRoutes from "../routes/clientBooking.routes";

const router = express.Router();

router.get("/v1", (_, res) => {
    res.json({
        message: "Welcome to my API",
    });
});

// Authentication & Users
router.use("/v1/auth", authRoute);
router.use("/v1/users", usersRoute);

// Events & Categories
router.use("/v1/events", eventRoutes);
router.use("/v1/categories", categoryRoutes);

// Bookings & Attendees
router.use("/v1/bookings", bookingRoutes);                     // Admin/Internal bookings
router.use("/v1/client/bookings", clientBookingRoutes);        // ← ADD THIS (Client-facing bookings)
router.use("/v1/attendees", bookingAttendeeRoutes);

// Payments
router.use("/v1/payments", paymentRoutes);

// Reviews & Favorites
router.use("/v1/reviews", reviewRoutes);
router.use("/v1/favorites", favoriteRoutes);

export default router;