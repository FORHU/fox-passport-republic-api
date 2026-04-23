import express from "express";
import EventRequestCtrl from "../controllers/event-request.controller";
import { authenticate, requireRole } from "../middleware/auth.middleware";

const router = express.Router();

// General requests (View/Create)
router.get("/", authenticate, EventRequestCtrl.getMyRequests);
router.get("/:id", authenticate, EventRequestCtrl.getRequestById);
router.post("/", authenticate, EventRequestCtrl.createRequest);

// Host review
router.patch("/:id/review", authenticate, requireRole(["host"]), EventRequestCtrl.reviewRequest);

export default router;
