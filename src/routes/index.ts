import express from "express";
import authRoute from "./auth.route";
import usersRoute from "./users.route";
import listingRoutes from "./listing.routes";
import categoryRoutes from "./category.routes";
import bookingRoutes from "./booking.routes";
import reviewRoutes from "./review.routes";
import favoriteRoutes from "./favorite.routes";
import paymentRoutes from "./payment.routes";
import bookingAttendeeRoutes from "./bookingAttendee.routes";
import clientBookingRoutes from "./clientBooking.routes";
import foxerRoutes from "./foxer.routes";
import specializedRoutes from "./specialized.routes";

const router = express.Router();

router.get("/v1", (_, res) => {
  res.json({
    message: "Welcome to my API",
  });
});

// Authentication & Users
router.use("/v1/auth", authRoute);
router.use("/v1/users", usersRoute);

// Listings & Categories
router.use("/v1/listings", listingRoutes);
router.use("/v1/categories", categoryRoutes);

// Bookings & Attendees
router.use("/v1/bookings", bookingRoutes);
router.use("/v1/client/bookings", clientBookingRoutes);
router.use("/v1/attendees", bookingAttendeeRoutes);

// Payments
router.use("/v1/payments", paymentRoutes);

// Reviews & Favorites
router.use("/v1/reviews", reviewRoutes);
router.use("/v1/favorites", favoriteRoutes);
router.use("/v1/foxers", foxerRoutes);
router.use("/v1", specializedRoutes);

export default router;
