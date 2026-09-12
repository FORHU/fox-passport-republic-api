import express from "express";
import EventCtrl from "./event.controller";
import { authenticate } from "../../middleware/auth.middleware";
import eventOrganizerRoutes from "../event-organizer/event-organizer.routes";

const router = express.Router();

router.get("/", authenticate, EventCtrl.getEvents);
router.use("/:eventId/organizers", eventOrganizerRoutes);

export default router;
