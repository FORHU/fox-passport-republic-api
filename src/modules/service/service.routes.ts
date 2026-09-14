import express from "express";
import ServiceCtrl from "./service.controller";
import {
  authenticate,
  requirePermissionAny,
} from "../../middleware/auth.middleware";

const router = express.Router();

// Public routes
router.get("/", ServiceCtrl.getServices);
router.get("/browse", ServiceCtrl.browseServices);
router.get("/:id", ServiceCtrl.getServiceById);

// Protected routes. `performer:manage` sits alongside `service:manage` since
// performer-category Service rows are owned by performerFoxer — the
// category-specific check (which of the two a given `category` requires)
// happens in the controller, once `category` is known; this route-level
// gate only asks "does the caller hold either."
router.post(
  "/create",
  authenticate,
  requirePermissionAny(["service:manage", "performer:manage"]),
  ServiceCtrl.createService,
);
router.put(
  "/:id",
  authenticate,
  requirePermissionAny(["service:manage", "performer:manage"]),
  ServiceCtrl.updateService,
);
router.delete(
  "/:id",
  authenticate,
  requirePermissionAny(["service:manage", "performer:manage"]),
  ServiceCtrl.deleteService,
);

// Approve/reject moved to admin.routes.ts (AdminCtrl) — this pair had
// diverged from it (no XP award, no socket announce) and this app only ever
// called the admin path. See docs/TOMORROW.md.

export default router;
