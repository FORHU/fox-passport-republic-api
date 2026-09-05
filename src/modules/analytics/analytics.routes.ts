import express from "express";
import { authenticate } from "../../middleware/auth.middleware";
import AnalyticsCtrl from "./analytics.controller";

const router = express.Router();

router.use(authenticate);

router.get("/event-stats", AnalyticsCtrl.getEventStats);

export default router;
