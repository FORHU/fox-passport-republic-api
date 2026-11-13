import express from "express";
import { MilestoneCtrl } from "./milestone.controller";
import { authenticate } from "../../middleware/auth.middleware";

const router = express.Router();

router.get("/me", authenticate, MilestoneCtrl.getMine);

export default router;
