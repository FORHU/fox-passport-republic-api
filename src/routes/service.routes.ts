import express from "express";
import ServiceCtrl from "../controllers/service.controller";
import { authenticate, requirePermission } from "../middleware/auth.middleware";

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

// Admin routes
router.patch(
  "/:id/approve",
  authenticate,
  requirePermission("queue:decide"),
  ServiceCtrl.approveService,
);
router.patch(
  "/:id/reject",
  authenticate,
  requirePermission("queue:decide"),
  ServiceCtrl.rejectService,
);

export default router;
