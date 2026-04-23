import express from "express";
import EventTemplateCtrl from "../controllers/event-template.controller";
import { authenticate, requireRole } from "../middleware/auth.middleware";

const router = express.Router();

// Public/Authenticated list
router.get("/", authenticate, EventTemplateCtrl.getTemplates);
router.get("/:id", authenticate, EventTemplateCtrl.getTemplateById);

// Organizer only actions
router.post("/", authenticate, requireRole(["host"]), EventTemplateCtrl.createTemplate);
router.delete("/:id", authenticate, requireRole(["host"]), EventTemplateCtrl.deleteTemplate);

// Asset associations
router.post("/:id/assets", authenticate, requireRole(["host"]), EventTemplateCtrl.attachAsset);
router.delete("/:id/assets/:assetId", authenticate, requireRole(["host"]), EventTemplateCtrl.removeAsset);

// Service associations
router.post("/:id/services", authenticate, requireRole(["host"]), EventTemplateCtrl.attachService);
router.delete("/:id/services/:serviceId", authenticate, requireRole(["host"]), EventTemplateCtrl.removeService);

// Venue associations
router.post("/:id/venues", authenticate, requireRole(["host"]), EventTemplateCtrl.attachVenue);
router.delete("/:id/venues/:venueId", authenticate, requireRole(["host"]), EventTemplateCtrl.removeVenue);

export default router;
