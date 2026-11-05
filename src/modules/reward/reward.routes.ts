import express from "express";
import RewardCtrl from "./reward.controller";
import { authenticate } from "../../middleware/auth.middleware";

const router = express.Router();

router.get("/me", authenticate, RewardCtrl.getMyWallet);
router.get("/catalog", authenticate, RewardCtrl.getCatalog);
router.post("/redeem", authenticate, RewardCtrl.redeemReward);

export default router;

