import express from "express";
import PassportCtrl from "./passport.controller";
import { authenticate, optionalAuth } from "../../middleware/auth.middleware";

const router = express.Router();

router.get("/badges", PassportCtrl.getAllBadges);
router.get("/leaderboard", PassportCtrl.getLeaderboard);
router.get("/me", authenticate, PassportCtrl.getMyPassport);
router.get("/me/badges", authenticate, PassportCtrl.getMyBadges);
router.get(
  "/support/priority-contact",
  authenticate,
  PassportCtrl.getPrioritySupportContact,
);
router.get("/:userId", optionalAuth, PassportCtrl.getPassportByUserId);

export default router;
