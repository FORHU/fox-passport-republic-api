import express from "express";
import ServiceCtrl from "./service.controller";
import {
  authenticate,
  requirePermission,
} from "../../middleware/auth.middleware";

const router = express.Router();

// Public routes
router.get("/", ServiceCtrl.getServices);
router.get("/browse", ServiceCtrl.browseServices);
router.get("/:id", ServiceCtrl.getServiceById);

// Protected routes
router.post(
  "/create",
  authenticate,
  requirePermission("service:manage"),
  ServiceCtrl.createService,
);
router.put(
  "/:id",
  authenticate,
  requirePermission("service:manage"),
  ServiceCtrl.updateService,
);
router.delete(
  "/:id",
  authenticate,
  requirePermission("service:manage"),
  ServiceCtrl.deleteService,
);

// Approve/reject moved to admin.routes.ts (AdminCtrl) — this pair had
// diverged from it (no XP award, no socket announce) and this app only ever
// called the admin path. See docs/TOMORROW.md.

export default router;
