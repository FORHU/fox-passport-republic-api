import express from "express";
import EventCtrl from "./event.controller";
import { authenticate } from "../../middleware/auth.middleware";
import appointmentTeamRoutes from "../appointment/appointment-team.routes";

const router = express.Router();

router.get("/", authenticate, EventCtrl.getEvents);
router.use("/:eventId/appointments", appointmentTeamRoutes);

export default router;
