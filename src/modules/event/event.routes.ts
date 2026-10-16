import express from "express";
import EventCtrl from "./event.controller";
import { authenticate } from "../../middleware/auth.middleware";
import appointmentTeamRoutes from "../appointment/appointment-team.routes";

const router = express.Router();

// Only explicitly published, approved upcoming events are searchable publicly.
router.get("/browse", EventCtrl.browsePublic);
// EventSvc verifies the authenticated event client before changing visibility.
router.patch(
  "/:id/public-visibility",
  authenticate,
  EventCtrl.setPublicVisibility,
);
router.get("/", authenticate, EventCtrl.getEvents);
router.use("/:eventId/appointments", appointmentTeamRoutes);

export default router;
