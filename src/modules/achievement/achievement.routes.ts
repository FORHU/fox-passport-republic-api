import express from "express";
import { AchievementCtrl } from "./achievement.controller";
import { authenticate } from "../../middleware/auth.middleware";

const router = express.Router();

router.get("/me", authenticate, AchievementCtrl.getMyAchievements);
router.get("/user/:userId", AchievementCtrl.getPublicAchievements);

export default router;
