import express from "express";
import LeaderboardCtrl from "./leaderboard.controller";
import { authenticate } from "../../middleware/auth.middleware";

const router = express.Router();

router.get("/foxers", authenticate, LeaderboardCtrl.foxers);

export default router;
