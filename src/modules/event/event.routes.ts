import express from "express";
import EventCtrl from "./event.controller";
import { authenticate } from "../../middleware/auth.middleware";

const router = express.Router();

router.get("/", authenticate, EventCtrl.getEvents);

export default router;
