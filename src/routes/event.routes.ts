import express from "express";
import EventCtrl from "../controllers/event.controller";

const router = express.Router();

// Event CRUD routes
router.get("/", EventCtrl.getAllEvents);
router.get("/:id", EventCtrl.getEventById);
router.post("/create", EventCtrl.createEvent);
router.post("/create-complete", EventCtrl.createCompleteEvent);
router.put("/:id", EventCtrl.updateEvent);
router.delete("/:id", EventCtrl.deleteEvent);

// Event details routes
router.put("/:id/details", EventCtrl.updateEventDetails);

// Event image routes
router.post("/:id/images", EventCtrl.addEventImage);

export default router;