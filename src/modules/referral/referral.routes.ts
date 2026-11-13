import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import ReferralCtrl from "./referral.controller";
import { referralApplyLimiter } from "./referral.rateLimit";

const router = Router();

router.get("/me", authenticate, ReferralCtrl.getMine);
router.post("/apply", authenticate, referralApplyLimiter, ReferralCtrl.apply);

export default router;
