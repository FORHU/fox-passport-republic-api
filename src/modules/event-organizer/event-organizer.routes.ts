import { Router } from "express";
import EventOrganizerController from "./event-organizer.controller";
import { authenticate } from "../../middleware/auth.middleware";

const router = Router({ mergeParams: true });

router.get("/", authenticate, EventOrganizerController.list);
router.post("/", authenticate, EventOrganizerController.assign);
router.delete("/:userId", authenticate, EventOrganizerController.remove);

export default router;
