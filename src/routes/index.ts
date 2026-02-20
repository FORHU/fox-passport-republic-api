import express from "express";
import authRoute from "./auth.route";
import usersRoute from "./users.route";
import profileRoute from "./profile.route";
import venueRoutes from "./venue.routes";
import eventRoutes from "./event.routes";
import bookingRoutes from "./booking.routes";
import bookingAttendeeRoutes from "./bookingAttendee.routes";
import paymentRoutes from "./payment.routes";
import categoryRoutes from "./category.routes";
// import reviewRoutes from "./review.routes"; 
// import favoriteRoutes from "./favorite.routes";

const router = express.Router();

router.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// Core Routes
router.use("/v1/auth", authRoute);
router.use("/v1/users", usersRoute);
router.use("/v1/profile", profileRoute);

// Feature Routes
router.use("/v1/venues", venueRoutes);
router.use("/v1/events", eventRoutes);
router.use("/v1/bookings", bookingRoutes);
router.use("/v1/attendees", bookingAttendeeRoutes);
router.use("/v1/payments", paymentRoutes);
router.use("/v1/categories", categoryRoutes);

// Temporarily disabled until updated
// router.use("/v1/reviews", reviewRoutes);
// router.use("/v1/favorites", favoriteRoutes);

export default router;
