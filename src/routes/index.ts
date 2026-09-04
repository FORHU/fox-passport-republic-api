import express from "express";
import authRoutes from "../modules/auth/auth.routes";
import usersRoutes from "../modules/users/users.routes";
import profileRoutes from "../modules/profile/profile.routes";
import roleRequestRoutes from "../modules/role-request/role-request.routes";
import categoryRoutes from "../modules/category/category.routes";
import venueRoutes from "../modules/venue/venue.routes";
import paymentRoutes from "../modules/payment/payment.routes";
import reviewRoutes from "../modules/review/review.routes";
import favoriteRoutes from "../modules/favorite/favorite.routes";
import assetRoutes from "../modules/asset/asset.routes";
import serviceRoutes from "../modules/service/service.routes";
import serviceBookingRoutes from "../modules/service-booking/service-booking.routes";
import assetBookingRoutes from "../modules/asset-booking/asset-booking.routes";
import s3Routes from "../modules/s3/s3.routes";
import fileRoutes from "../modules/file/file.routes";
import adminRoutes from "../modules/admin/admin.routes";
import eventTemplateRoutes from "../modules/event-template/event-template.routes";
import eventRequestRoutes from "../modules/event-request/event-request.routes";
import eventTransactionRoutes from "../modules/event-transaction/event-transaction.routes";
import matchRoutes from "../modules/match/match.routes";
import bookingRoutes from "../modules/booking/booking.routes";
import notificationRoutes from "../modules/notifications/user-notification.routes";
import stripeConnectRoutes from "../modules/stripe-connect/stripe-connect.routes";
import cancellationPolicyRoutes from "../modules/cancellation-policy/cancellation-policy.routes";
import waitlistRoutes from "../modules/waitlist/waitlist.routes";
import locationsRoutes from "../modules/locations/locations.routes";
import passportRoutes from "../modules/passport/passport.routes";
import analyticsRoutes from "../modules/analytics/analytics.routes";
import searchRoutes from "../modules/search/search.routes";

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
router.use("/v1/payments", paymentRoutes);
router.use("/v1/notifications", notificationRoutes);
// Booking sub-routes must be registered BEFORE the generic /:id routes
router.use("/v1/service/bookings", serviceBookingRoutes);
router.use("/v1/asset/bookings", assetBookingRoutes);
router.use("/v1/asset", assetRoutes);
router.use("/v1/service", serviceRoutes);
router.use("/v1/files", fileRoutes);
router.use("/v1/event-templates", eventTemplateRoutes);
router.use("/v1/event-requests", eventRequestRoutes);
router.use("/v1/event-transactions", eventTransactionRoutes);
// Feature Routes (Reviews & Favorites)
router.use("/v1/reviews", reviewRoutes);
router.use("/v1/favorites", favoriteRoutes);
router.use("/v1/matches", matchRoutes);
router.use("/v1/bookings", bookingRoutes);
router.use("/v1/cancellation-policies", cancellationPolicyRoutes);
router.use("/v1/waitlist", waitlistRoutes);
router.use("/v1/locations", locationsRoutes);
router.use("/v1/passport", passportRoutes);
router.use("/v1/analytics", analyticsRoutes);
router.use("/v1/search", searchRoutes);
router.use("/v1/stripe-connect", stripeConnectRoutes);

// Admin Routes
router.use("/v1/admin", adminRoutes);

// S3 Routes
router.use("/v1/s3", s3Routes);

export default router;
