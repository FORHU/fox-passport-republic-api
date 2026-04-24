import express from "express";
import EventRequestCtrl from "../controllers/event-request.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = express.Router();

router.post("/", authenticate, EventRequestCtrl.create);
router.get("/my", authenticate, EventRequestCtrl.listMyRequests);
router.get("/:id", authenticate, EventRequestCtrl.getById);

export default router;
