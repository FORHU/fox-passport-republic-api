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
import reviewRoutes from "./review.routes";
import favoriteRoutes from "./favorite.routes";

const router = express.Router();

router.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

router.get("/v1", (req, res) => {
  res.status(200).send("Welcome to my API");
});

// Diagnostic middleware
router.use("/v1", (req, res, next) => {
  console.log(`📡 V1 ROUTE DETECTED: ${req.method} ${req.url}`);
  next();
});

// Core Routes
router.use("/v1/auth", authRoute);
router.use("/v1/users", usersRoute);
router.use("/v1/profile", profileRoute);

// Feature Routes
router.use("/v1/venues", venueRoutes);
router.use("/v1/venues/", venueRoutes); // Trailing slash alias
router.use("/v1/venue", venueRoutes); // Singular alias
router.use("/v1/venue/", venueRoutes); // Singular alias with trailing slash
router.use("/v1/events", eventRoutes);
router.use("/v1/events/", eventRoutes); // Trailing slash alias
router.use("/events", eventRoutes); // backward-compatible route
router.use("/events/", eventRoutes); // backward-compatible route with trailing slash
router.use("/v1/bookings", bookingRoutes);
router.use("/v1/bookings/", bookingRoutes); // Trailing slash alias
router.use("/v1/attendees", bookingAttendeeRoutes);
router.use("/v1/attendees/", bookingAttendeeRoutes); // Trailing slash alias
router.use("/v1/payments", paymentRoutes);
router.use("/v1/payments/", paymentRoutes); // Trailing slash alias
router.use("/v1/categories", categoryRoutes);
router.use("/v1/categories/", categoryRoutes); // Trailing slash alias

// Feature Routes (Reviews & Favorites)
router.use("/v1/reviews", reviewRoutes);
router.use("/v1/favorites", favoriteRoutes);

export default router;
