import express from "express";
import AdminCtrl from "../controllers/admin.controller";
import BookingCtrl from "../controllers/booking.controller";
import {
  authenticate,
  requireAdmin,
  requirePermission,
} from "../middleware/auth.middleware";

const router = express.Router();

// Stats
router.get(
  "/stats",
  authenticate,
  requirePermission("admin:access"),
  AdminCtrl.getStats,
);

// Venues
router.get(
  "/venues",
  authenticate,
  requirePermission("queue:read"),
  AdminCtrl.getAllVenues,
);
router.get(
  "/venues/pending",
  authenticate,
  requirePermission("queue:read"),
  AdminCtrl.getPendingVenues,
);
router.patch(
  "/venues/:id/approve",
  authenticate,
  requirePermission("queue:decide"),
  AdminCtrl.approveVenue,
);
router.patch(
  "/venues/:id/reject",
  authenticate,
  requirePermission("queue:decide"),
  AdminCtrl.rejectVenue,
);

// Assets (equipment)
router.get(
  "/assets",
  authenticate,
  requirePermission("queue:read"),
  AdminCtrl.getAllAssets,
);
router.get(
  "/assets/pending",
  authenticate,
  requirePermission("queue:read"),
  AdminCtrl.getPendingAssets,
);
router.patch(
  "/assets/:id/approve",
  authenticate,
  requirePermission("queue:decide"),
  AdminCtrl.approveAsset,
);
router.patch(
  "/assets/:id/reject",
  authenticate,
  requirePermission("queue:decide"),
  AdminCtrl.rejectAsset,
);

// Services
router.get(
  "/services",
  authenticate,
  requirePermission("queue:read"),
  AdminCtrl.getAllServices,
);
router.get(
  "/services/pending",
  authenticate,
  requirePermission("queue:read"),
  AdminCtrl.getPendingServices,
);
router.patch(
  "/services/:id/approve",
  authenticate,
  requirePermission("queue:decide"),
  AdminCtrl.approveService,
);
router.patch(
  "/services/:id/reject",
  authenticate,
  requirePermission("queue:decide"),
  AdminCtrl.rejectService,
);

// Event Templates (content moderation — controls what shows on category pages)
router.get(
  "/event-templates",
  authenticate,
  requirePermission("queue:read"),
  AdminCtrl.getAllEventTemplates,
);
router.get(
  "/event-templates/pending",
  authenticate,
  requirePermission("queue:read"),
  AdminCtrl.getPendingEventTemplates,
);
router.patch(
  "/event-templates/:id/approve",
  authenticate,
  requirePermission("queue:decide"),
  AdminCtrl.approveEventTemplate,
);
router.patch(
  "/event-templates/:id/reject",
  authenticate,
  requirePermission("queue:decide"),
  AdminCtrl.rejectEventTemplate,
);

// Bookings
router.get("/bookings", authenticate, requireAdmin, BookingCtrl.getAllBookings);

// Asset Booking Disputes
router.get(
  "/asset-bookings/disputes",
  authenticate,
  requireAdmin,
  AdminCtrl.getAssetBookingDisputes,
);
router.patch(
  "/asset-bookings/:id/resolve",
  authenticate,
  requireAdmin,
  AdminCtrl.resolveAssetBookingDispute,
);

// Service Booking Disputes
router.get(
  "/service-bookings/disputes",
  authenticate,
  requireAdmin,
  AdminCtrl.getServiceBookingDisputes,
);
router.patch(
  "/service-bookings/:id/resolve",
  authenticate,
  requireAdmin,
  AdminCtrl.resolveServiceBookingDispute,
);

// Disputes & Refunds
router.get("/disputes", authenticate, requireAdmin, AdminCtrl.getDisputes);
router.patch(
  "/disputes/:id/resolve",
  authenticate,
  requireAdmin,
  AdminCtrl.resolveDispute,
);
router.get("/refunds", authenticate, requireAdmin, AdminCtrl.getAllRefunds);
router.post(
  "/refunds/manual",
  authenticate,
  requireAdmin,
  AdminCtrl.manualRefund,
);
router.get(
  "/refund-failures",
  authenticate,
  requireAdmin,
  AdminCtrl.getFailedRefunds,
);
router.get(
  "/refunds/:id/failure-reason",
  authenticate,
  requireAdmin,
  AdminCtrl.getRefundFailureReason,
);
router.post(
  "/refunds/:id/retry",
  authenticate,
  requireAdmin,
  AdminCtrl.retryRefund,
);
router.post(
  "/refunds/:id/resolve-manual",
  authenticate,
  requireAdmin,
  AdminCtrl.resolveManualRefund,
);

// Events (booking requests)
router.get(
  "/events",
  authenticate,
  requirePermission("queue:read"),
  AdminCtrl.getAllEvents,
);
router.get(
  "/events/pending",
  authenticate,
  requirePermission("queue:read"),
  AdminCtrl.getPendingEvents,
);
router.patch(
  "/events/:id/approve",
  authenticate,
  requirePermission("queue:decide"),
  AdminCtrl.approveEvent,
);
router.patch(
  "/events/:id/reject",
  authenticate,
  requirePermission("queue:decide"),
  AdminCtrl.rejectEvent,
);

export default router;
