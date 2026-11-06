import express from "express";
import OnboardingCtrl from "./onboarding.controller";
import { authenticate } from "../../middleware/auth.middleware";

const router = express.Router();

router.get("/", authenticate, OnboardingCtrl.list);
router.post("/:step", authenticate, OnboardingCtrl.complete);

export default router;
