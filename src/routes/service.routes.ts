import express from "express";
import ServiceCtrl from "../controllers/service.controller";
import { authenticate } from "../middleware/auth.middleware";
import { upload } from "../middleware/fileUpload";

const router = express.Router();

// Public routes
router.get("/", ServiceCtrl.getServices);
router.get("/:id", ServiceCtrl.getServiceById);

// Protected routes
router.post("/", authenticate, upload.array("images", 10), ServiceCtrl.createService);
router.post("/create", authenticate, upload.array("images", 10), ServiceCtrl.createService);
router.put("/:id", authenticate, ServiceCtrl.updateService);
router.delete("/:id", authenticate, ServiceCtrl.deleteService);

// Image management handlers
router.post("/:id/images", authenticate, upload.array("images", 10), ServiceCtrl.uploadServiceImages);
router.put("/images/:imageId", authenticate, ServiceCtrl.updateServiceImage);
router.delete("/images/:imageId", authenticate, ServiceCtrl.deleteServiceImage);

export default router;
