import express from "express";
import EventCtrl from "../controllers/event.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = express.Router();

// Public
router.get("/", EventCtrl.getAllEvents);
router.get("/:id", EventCtrl.getEventById);

// Protected
router.use(authenticate);
router.post("/", EventCtrl.createEvent);

export default router;
