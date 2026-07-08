import express from "express";
import AdminCtrl from "../controllers/admin.controller";
import BookingCtrl from "../controllers/booking.controller";
import { authenticate, requireAdmin } from "../middleware/auth.middleware";

const router = express.Router();

// Stats
router.get("/stats", authenticate, requireAdmin, AdminCtrl.getStats);

// Venues
router.get("/venues", authenticate, requireAdmin, AdminCtrl.getAllVenues);
router.get(
  "/venues/pending",
  authenticate,
  requireAdmin,
  AdminCtrl.getPendingVenues,
);
router.patch(
  "/venues/:id/approve",
  authenticate,
  requireAdmin,
  AdminCtrl.approveVenue,
);
router.patch(
  "/venues/:id/reject",
  authenticate,
  requireAdmin,
  AdminCtrl.rejectVenue,
);

// Assets (equipment)
router.get("/assets", authenticate, requireAdmin, AdminCtrl.getAllAssets);
router.get(
  "/assets/pending",
  authenticate,
  requireAdmin,
  AdminCtrl.getPendingAssets,
);
router.patch(
  "/assets/:id/approve",
  authenticate,
  requireAdmin,
  AdminCtrl.approveAsset,
);
router.patch(
  "/assets/:id/reject",
  authenticate,
  requireAdmin,
  AdminCtrl.rejectAsset,
);

// Services
router.get("/services", authenticate, requireAdmin, AdminCtrl.getAllServices);
router.get(
  "/services/pending",
  authenticate,
  requireAdmin,
  AdminCtrl.getPendingServices,
);
router.patch(
  "/services/:id/approve",
  authenticate,
  requireAdmin,
  AdminCtrl.approveService,
);
router.patch(
  "/services/:id/reject",
  authenticate,
  requireAdmin,
  AdminCtrl.rejectService,
);

// Event Templates (content moderation — controls what shows on category pages)
router.get(
  "/event-templates",
  authenticate,
  requireAdmin,
  AdminCtrl.getAllEventTemplates,
);
router.patch(
  "/event-templates/:id/approve",
  authenticate,
  requireAdmin,
  AdminCtrl.approveEventTemplate,
);
router.patch(
  "/event-templates/:id/reject",
  authenticate,
  requireAdmin,
  AdminCtrl.rejectEventTemplate,
);

// Bookings
router.get("/bookings", authenticate, requireAdmin, BookingCtrl.getAllBookings);

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
router.get("/events", authenticate, requireAdmin, AdminCtrl.getAllEvents);
router.get(
  "/events/pending",
  authenticate,
  requireAdmin,
  AdminCtrl.getPendingEvents,
);
router.patch(
  "/events/:id/approve",
  authenticate,
  requireAdmin,
  AdminCtrl.approveEvent,
);
router.patch(
  "/events/:id/reject",
  authenticate,
  requireAdmin,
  AdminCtrl.rejectEvent,
);

export default router;
