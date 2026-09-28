import { Router } from "express";
import AppointmentController from "./appointment.controller";
import { authenticate } from "../../middleware/auth.middleware";

/**
 * Mounted at /v1/events/:eventId/appointments and
 * /v1/venues/:venueId/appointments — a Mayor's or Event Owner's team.
 *
 * Authorized inside AppointmentService, not by `requirePermission`: the check
 * is "owns this one Venue or Event", which no global permission can express.
 * Each route is on validate-rbac-guards' allow-list.
 */
const router = Router({ mergeParams: true });

router.get("/", authenticate, AppointmentController.list);
router.get("/settings", authenticate, AppointmentController.getSettings);
router.patch("/settings", authenticate, AppointmentController.setSettings);
router.post(
  "/:appointmentId/approve-request",
  authenticate,
  AppointmentController.approveRequest,
);
router.post(
  "/:appointmentId/decline-request",
  authenticate,
  AppointmentController.declineRequest,
);
router.post("/", authenticate, AppointmentController.appoint);
router.delete("/:appointmentId", authenticate, AppointmentController.remove);

export default router;
