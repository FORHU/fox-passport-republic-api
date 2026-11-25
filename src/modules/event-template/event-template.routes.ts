import express from "express";
import EventTemplateCtrl from "./event-template.controller";
import {
  authenticate,
  requirePermission,
  requirePermissionAny,
} from "../../middleware/auth.middleware";

const router = express.Router();

// Public browse — no auth, only isPublic templates, supports ?category=
router.get("/browse", EventTemplateCtrl.browsePublic);
router.get("/browse/:id", EventTemplateCtrl.browsePublicById);
router.get("/recommendations", EventTemplateCtrl.getRecommendations);

// Trending — public, no auth, returns top N templates by booking count for a category
router.get("/trending", EventTemplateCtrl.getTrending);

// Public/Authenticated list
router.get("/", authenticate, EventTemplateCtrl.getTemplates);
router.get("/:id", authenticate, EventTemplateCtrl.getTemplateById);

// Organizer only actions
router.post(
  "/",
  authenticate,
  requirePermission("template:manage"),
  EventTemplateCtrl.createTemplate,
);
router.post(
  "/:id/submit",
  authenticate,
  requirePermission("template:manage"),
  EventTemplateCtrl.submitTemplate,
);
router.put(
  "/:id",
  authenticate,
  requirePermission("template:manage"),
  EventTemplateCtrl.updateTemplate,
);
router.delete(
  "/:id",
  authenticate,
  requirePermission("template:manage"),
  EventTemplateCtrl.deleteTemplate,
);
// The package's History: edits, items and bookings. Owner only (the service
// checks ownership; `template:manage` alone is every Event Foxer).
router.get(
  "/:id/history",
  authenticate,
  requirePermission("template:manage"),
  EventTemplateCtrl.history,
);

// Asset associations
router.post(
  "/:id/assets",
  authenticate,
  requirePermission("template:manage"),
  EventTemplateCtrl.attachAsset,
);
// Make a line optional or required, keeping it and its answer (api#459).
router.patch(
  "/:id/assets/:itemId",
  authenticate,
  requirePermission("template:manage"),
  EventTemplateCtrl.setLineOptional("asset"),
);
router.delete(
  "/:id/assets/:assetId",
  authenticate,
  requirePermission("template:manage"),
  EventTemplateCtrl.removeAsset,
);

// Service associations
router.post(
  "/:id/services",
  authenticate,
  requirePermission("template:manage"),
  EventTemplateCtrl.attachService,
);
router.patch(
  "/:id/services/:itemId",
  authenticate,
  requirePermission("template:manage"),
  EventTemplateCtrl.setLineOptional("service"),
);
router.delete(
  "/:id/services/:serviceId",
  authenticate,
  requirePermission("template:manage"),
  EventTemplateCtrl.removeService,
);

// Venue associations
router.post(
  "/:id/venues",
  authenticate,
  requirePermission("template:manage"),
  EventTemplateCtrl.attachVenue,
);
router.patch(
  "/:id/venues/:itemId",
  authenticate,
  requirePermission("template:manage"),
  EventTemplateCtrl.setLineOptional("venue"),
);
router.delete(
  "/:id/venues/:venueId",
  authenticate,
  requirePermission("template:manage"),
  EventTemplateCtrl.removeVenue,
);

// Location Matching
router.get(
  "/matching/search",
  authenticate,
  requirePermission("template:manage"),
  EventTemplateCtrl.matchSearch,
);
router.post(
  "/:id/match",
  authenticate,
  requirePermission("template:manage"),
  EventTemplateCtrl.matchItem,
);

// Match request management
router.get(
  "/matches/outgoing",
  authenticate,
  requirePermission("template:manage"),
  EventTemplateCtrl.getOutgoingMatchRequests,
);
router.get(
  "/matches/incoming",
  authenticate,
  EventTemplateCtrl.getIncomingMatchRequests,
);
router.patch(
  "/matches/:matchId/respond",
  authenticate,
  EventTemplateCtrl.respondToMatch,
);
// A Supplier leaves a package they joined (api#461); the service checks the
// line is theirs.
router.post(
  "/matches/:matchId/leave",
  authenticate,
  requirePermissionAny(["venue:manage", "asset:manage", "service:manage"]),
  EventTemplateCtrl.leaveMatch,
);

// Approve/reject moved to admin.routes.ts (AdminCtrl) — this pair had
// diverged from it (no socket announce) and this app only ever called the
// admin path. See docs/NEXT.md.

export default router;
