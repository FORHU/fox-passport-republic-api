import express from "express";
import EventRequestCtrl from "../controllers/event-request.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = express.Router();

router.post("/", authenticate, EventRequestCtrl.spawnRequest);
router.get("/my", authenticate, EventRequestCtrl.listMyRequests);
router.patch("/:id/approve", authenticate, EventRequestCtrl.approve);
router.patch("/:id/complete", authenticate, EventRequestCtrl.complete);
router.get("/:id", authenticate, EventRequestCtrl.getById);

export default router;
