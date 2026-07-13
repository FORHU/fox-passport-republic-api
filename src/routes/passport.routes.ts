import express from "express";
import PassportCtrl from "../controllers/passport.controller";
import { authenticate, optionalAuth } from "../middleware/auth.middleware";

const router = express.Router();

router.get("/badges", PassportCtrl.getAllBadges);
router.get("/me", authenticate, PassportCtrl.getMyPassport);
router.get("/:userId", optionalAuth, PassportCtrl.getPassportByUserId);

export default router;
