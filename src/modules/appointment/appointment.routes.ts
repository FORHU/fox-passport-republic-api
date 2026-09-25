import { Router } from "express";
import AppointmentController from "./appointment.controller";
import { authenticate } from "../../middleware/auth.middleware";

/**
 * /v1/appointments — the appointed person's own invitations and teams.
 *
 * Authorized inside AppointmentService, not by `requirePermission`: only the
 * person an Appointment names may answer or leave it, which no global
 * permission can express. Each route is on validate-rbac-guards' allow-list.
 */
const router = Router();

router.get("/mine", authenticate, AppointmentController.mine);
router.get("/access", authenticate, AppointmentController.access);
router.get("/join-status", authenticate, AppointmentController.joinStatus);
router.get("/open", authenticate, AppointmentController.open);
router.get("/organizers", authenticate, AppointmentController.searchOrganizers);
router.post("/request", authenticate, AppointmentController.request);
router.post(
  "/:appointmentId/withdraw",
  authenticate,
  AppointmentController.withdraw,
);
router.post(
  "/:appointmentId/accept",
  authenticate,
  AppointmentController.accept,
);
router.post(
  "/:appointmentId/decline",
  authenticate,
  AppointmentController.decline,
);
router.post("/:appointmentId/leave", authenticate, AppointmentController.leave);

export default router;
