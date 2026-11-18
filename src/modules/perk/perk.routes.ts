import express from "express";
import PerkCtrl from "./perk.controller";
import { authenticate } from "../../middleware/auth.middleware";

const router = express.Router();

// Self-service: every read and write is scoped to the signed-in person in the
// service (their balance, their bookings, their redemptions).
router.get("/", authenticate, PerkCtrl.list);
router.get("/mine", authenticate, PerkCtrl.mine);
router.get("/redemptions/:id/code", authenticate, PerkCtrl.code);
router.get("/:id", authenticate, PerkCtrl.detail);
router.post("/:id/redeem", authenticate, PerkCtrl.redeem);

export default router;
