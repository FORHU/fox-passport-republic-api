import express from "express";
import LeaderboardCtrl from "./leaderboard.controller";
import { authenticate } from "../../middleware/auth.middleware";

const router = express.Router();

router.get("/foxers", authenticate, LeaderboardCtrl.foxers);
router.get("/citizens", authenticate, LeaderboardCtrl.citizens);

export default router;
