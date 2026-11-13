import express from "express";
import RewardCtrl from "./reward.controller";
import DailyLoginCtrl from "../daily-login/daily-login.controller";
import { authenticate } from "../../middleware/auth.middleware";

const router = express.Router();

router.get("/me", authenticate, RewardCtrl.getMyWallet);
router.get("/catalog", authenticate, RewardCtrl.getCatalog);
router.post("/redeem", authenticate, RewardCtrl.redeemReward);
router.get("/daily-login", authenticate, DailyLoginCtrl.getStatus);
router.post("/daily-login", authenticate, DailyLoginCtrl.claim);

export default router;
