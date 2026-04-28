import express from "express";
import EventRequestCtrl from "../controllers/event-request.controller";
import { authenticate, requireAdmin, requireRole } from "../middleware/auth.middleware";

const router = express.Router();

// Public — approved events for landing page
router.get("/", EventRequestCtrl.listApproved);

// Host — create event
router.post("/", authenticate, requireRole(["host"]), EventRequestCtrl.spawnRequest);

// Authenticated
router.get("/my", authenticate, EventRequestCtrl.listMyRequests);
router.get("/:id", authenticate, EventRequestCtrl.getById);

// Admin only
router.patch("/:id/approve", authenticate, requireAdmin, EventRequestCtrl.approve);
router.patch("/:id/complete", authenticate, requireAdmin, EventRequestCtrl.complete);

export default router;
