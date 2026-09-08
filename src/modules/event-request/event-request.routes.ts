import express from "express";
import EventRequestCtrl from "./event-request.controller";
import {
  authenticate,
  requirePermission,
} from "../../middleware/auth.middleware";

const router = express.Router();

// Public — approved events for landing page
router.get("/", EventRequestCtrl.listApproved);

// Authenticated — create event context (booking flow step 1)
router.post("/", authenticate, EventRequestCtrl.spawnRequest);

// Authenticated
router.get("/my", authenticate, EventRequestCtrl.listMyRequests);
router.get("/:id", authenticate, EventRequestCtrl.getById);

// Admin only
router.patch(
  "/:id/approve",
  authenticate,
  requirePermission("queue:decide"),
  EventRequestCtrl.approve,
);
router.patch(
  "/:id/reject",
  authenticate,
  requirePermission("queue:decide"),
  EventRequestCtrl.reject,
);
router.patch(
  "/:id/complete",
  authenticate,
  requirePermission("queue:decide"),
  EventRequestCtrl.complete,
);

export default router;
