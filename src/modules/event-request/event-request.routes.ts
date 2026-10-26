import express from "express";
import EventRequestCtrl from "./event-request.controller";
import { authenticate } from "../../middleware/auth.middleware";

const router = express.Router();

// Public — approved events for landing page
router.get("/", EventRequestCtrl.listApproved);

// Authenticated — create event context (booking flow step 1)
router.post("/", authenticate, EventRequestCtrl.spawnRequest);

// Authenticated
router.get("/my", authenticate, EventRequestCtrl.listMyRequests);
router.get("/:id", authenticate, EventRequestCtrl.getById);

// Approving and rejecting an Event is `PATCH /admin/events/:id/approve|reject`
// (admin.routes.ts), which also publishes the template, notifies and
// announces. The duplicates that sat here did none of that and had no caller.
// Nothing marks an Event completed by hand either: its status follows its
// bookings (EventRequestSvc.syncStatusFromBookings).

export default router;
