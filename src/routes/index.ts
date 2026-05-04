import express from "express";
import authRoutes from "./auth.routes";
import usersRoutes from "./users.routes";
import profileRoutes from "./profile.routes";
import roleRequestRoutes from "./role-request.routes";
import categoryRoutes from "./category.routes";
import venueRoutes from "./venue.routes";
import paymentRoutes from "./payment.routes";
import reviewRoutes from "./review.routes";
import favoriteRoutes from "./favorite.routes";
import assetRoutes from "./asset.routes";
import serviceRoutes from "./service.routes";
import serviceBookingRoutes from "./service-booking.routes";
import assetBookingRoutes from "./asset-booking.routes";
import s3Routes from "./s3.routes";
import fileRoutes from "./file.routes";
import adminRoutes from "./admin.routes";
import eventTemplateRoutes from "./event-template.routes";
import eventRequestRoutes from "./event-request.routes";
import eventTransactionRoutes from "./event-transaction.routes";
import matchRoutes from "./match.routes";
import bookingRoutes from "./booking.routes";

const router = express.Router();

router.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

router.get("/v1", (req, res) => {
  res.status(200).send("Welcome to my API");
});

// Core Routes
router.use("/v1/auth", authRoutes);
router.use("/v1/users", usersRoutes);
router.use("/v1/profile", profileRoutes);
router.use("/v1/role-requests", roleRequestRoutes);
router.use("/v1/categories", categoryRoutes);

// Feature Routes
router.use("/v1/venues", venueRoutes);
router.use("/v1/venues/", venueRoutes); // Trailing slash alias
router.use("/v1/venue", venueRoutes); // Singular alias
router.use("/v1/venue/", venueRoutes); // Singular alias with trailing slash
router.use("/v1/payments", paymentRoutes);
router.use("/v1/payments/", paymentRoutes); // Trailing slash alias
// Booking sub-routes must be registered BEFORE the generic /:id routes
router.use("/v1/service/bookings", serviceBookingRoutes);
router.use("/v1/asset/bookings", assetBookingRoutes);
router.use("/v1/asset", assetRoutes);
router.use("/v1/service", serviceRoutes);
router.use("/v1/files", fileRoutes);
router.use("/v1/file", fileRoutes);
router.use("/v1/event-templates", eventTemplateRoutes);
router.use("/v1/event-requests", eventRequestRoutes);
router.use("/v1/event-transactions", eventTransactionRoutes);
// Feature Routes (Reviews & Favorites)
router.use("/v1/reviews", reviewRoutes);
router.use("/v1/favorites", favoriteRoutes);
router.use("/v1/matches", matchRoutes);
router.use("/v1/bookings", bookingRoutes);

// Admin Routes
router.use("/v1/admin", adminRoutes);

// S3 Routes
router.use("/v1/s3", s3Routes);

export default router;

