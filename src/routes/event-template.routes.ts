import express from "express";
import EventTemplateCtrl from "../controllers/event-template.controller";
import {
  authenticate,
  optionalAuth,
  requireRole,
} from "../middleware/auth.middleware";

const router = express.Router();

// Public browse — no auth, only isPublic templates, supports ?category=
router.get("/browse", EventTemplateCtrl.browsePublic);
router.get("/browse/:id", optionalAuth, EventTemplateCtrl.browsePublicById);

// Public/Authenticated list
router.get("/", authenticate, EventTemplateCtrl.getTemplates);
router.get("/:id", authenticate, EventTemplateCtrl.getTemplateById);

// Organizer only actions
router.post(
  "/",
  authenticate,
  requireRole(["eventFoxer"]),
  EventTemplateCtrl.createTemplate,
);
router.post(
  "/:id/submit",
  authenticate,
  requireRole(["eventFoxer"]),
  EventTemplateCtrl.submitTemplate,
);
router.put(
  "/:id",
  authenticate,
  requireRole(["eventFoxer"]),
  EventTemplateCtrl.updateTemplate,
);
router.delete(
  "/:id",
  authenticate,
  requireRole(["eventFoxer"]),
  EventTemplateCtrl.deleteTemplate,
);

// Asset associations
router.post(
  "/:id/assets",
  authenticate,
  requireRole(["eventFoxer"]),
  EventTemplateCtrl.attachAsset,
);
router.delete(
  "/:id/assets/:assetId",
  authenticate,
  requireRole(["eventFoxer"]),
  EventTemplateCtrl.removeAsset,
);

// Service associations
router.post(
  "/:id/services",
  authenticate,
  requireRole(["eventFoxer"]),
  EventTemplateCtrl.attachService,
);
router.delete(
  "/:id/services/:serviceId",
  authenticate,
  requireRole(["eventFoxer"]),
  EventTemplateCtrl.removeService,
);

// Venue associations
router.post(
  "/:id/venues",
  authenticate,
  requireRole(["eventFoxer"]),
  EventTemplateCtrl.attachVenue,
);
router.delete(
  "/:id/venues/:venueId",
  authenticate,
  requireRole(["eventFoxer"]),
  EventTemplateCtrl.removeVenue,
);

// Location Matching
router.get(
  "/matching/search",
  authenticate,
  requireRole(["eventFoxer"]),
  EventTemplateCtrl.matchSearch,
);
router.post(
  "/:id/match",
  authenticate,
  requireRole(["eventFoxer"]),
  EventTemplateCtrl.matchItem,
);

// Admin routes
router.patch(
  "/:id/approve",
  authenticate,
  requireRole(["admin", "super_admin"]),
  EventTemplateCtrl.approveEventTemplate,
);
router.patch(
  "/:id/reject",
  authenticate,
  requireRole(["admin", "super_admin"]),
  EventTemplateCtrl.rejectEventTemplate,
);

export default router;
