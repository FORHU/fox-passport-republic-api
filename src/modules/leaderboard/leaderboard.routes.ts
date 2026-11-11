import { Router } from "express";
import { optionalAuth } from "../../middleware/auth.middleware";
import LeaderboardCtrl from "./leaderboard.controller";

const router = Router();

router.get("/foxers", optionalAuth, LeaderboardCtrl.getFoxers);

export default router;
