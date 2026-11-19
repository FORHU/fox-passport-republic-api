import express from "express";
import PerkCtrl from "./perk.controller";
import { authenticate } from "../../middleware/auth.middleware";

const router = express.Router();

// Self-service: every read and write is scoped to the signed-in person in the
// service (their balance, their bookings, their redemptions).
router.get("/", authenticate, PerkCtrl.list);
router.post("/", authenticate, PerkCtrl.create);
router.get("/mine", authenticate, PerkCtrl.mine);
router.get("/offered", authenticate, PerkCtrl.offered);
router.post("/check", authenticate, PerkCtrl.check);
router.get("/redemptions/:id/code", authenticate, PerkCtrl.code);
router.post("/redemptions/:id/use", authenticate, PerkCtrl.use);
router.post("/:id/take-down", authenticate, PerkCtrl.takeDown);
router.get("/:id", authenticate, PerkCtrl.detail);
router.post("/:id/redeem", authenticate, PerkCtrl.redeem);

export default router;
