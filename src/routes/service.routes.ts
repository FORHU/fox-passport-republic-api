import express from "express";
import ServiceCtrl from "../controllers/service.controller";
import { authenticate, requireRole } from "../middleware/auth.middleware";

const router = express.Router();

// Public routes
router.get("/", ServiceCtrl.getServices);
router.get("/:id", ServiceCtrl.getServiceById);

// Protected routes
router.post(
  "/create",
  authenticate,
  requireRole(["serviceFoxer"]),
  ServiceCtrl.createService,
);
router.put(
  "/:id",
  authenticate,
  requireRole(["serviceFoxer"]),
  ServiceCtrl.updateService,
);
router.delete(
  "/:id",
  authenticate,
  requireRole(["serviceFoxer"]),
  ServiceCtrl.deleteService,
);

// Admin routes
router.patch(
  "/:id/approve",
  authenticate,
  requireRole(["admin", "super_admin"]),
  ServiceCtrl.approveService,
);
router.patch(
  "/:id/reject",
  authenticate,
  requireRole(["admin", "super_admin"]),
  ServiceCtrl.rejectService,
);

export default router;
