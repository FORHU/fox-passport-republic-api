import express from "express";
import EventTemplateCtrl from "../controllers/event-template.controller";
import { authenticate, requireRole } from "../middleware/auth.middleware";

const router = express.Router();

// Public browse — no auth, only isPublic templates, supports ?category=
router.get("/browse", EventTemplateCtrl.browsePublic);

// Public/Authenticated list
router.get("/", authenticate, EventTemplateCtrl.getTemplates);
router.get("/:id", authenticate, EventTemplateCtrl.getTemplateById);

// Organizer only actions
router.post("/", authenticate, requireRole(["host"]), EventTemplateCtrl.createTemplate);
router.put("/:id", authenticate, requireRole(["host"]), EventTemplateCtrl.updateTemplate);
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

// Location Matching
router.get("/matching/search", authenticate, requireRole(["host"]), EventTemplateCtrl.matchSearch);
router.post("/:id/match", authenticate, requireRole(["host"]), EventTemplateCtrl.matchItem);

export default router;
