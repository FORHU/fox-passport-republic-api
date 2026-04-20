import express from "express";
import ServiceCtrl from "../controllers/service.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = express.Router();

// Public routes
router.get("/", ServiceCtrl.getServices);
router.get("/:id", ServiceCtrl.getServiceById);

// Protected routes
router.post("/create", authenticate, ServiceCtrl.createService);
router.put("/:id", authenticate, ServiceCtrl.updateService);
router.delete("/:id", authenticate, ServiceCtrl.deleteService);

export default router;
