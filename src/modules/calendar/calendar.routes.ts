import express from "express";
import CalendarCtrl from "./calendar.controller";
import { authenticate } from "../../middleware/auth.middleware";

const router = express.Router();

router.get("/", authenticate, CalendarCtrl.getMine);

export default router;
