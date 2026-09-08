import express from "express";
import WaitlistCtrl from "./waitlist.controller";
import { authenticate, optionalAuth } from "../../middleware/auth.middleware";

const router = express.Router();

// GET /waitlist?templateId=X — check status (works with or without auth)
router.get("/", optionalAuth, WaitlistCtrl.getStatus);

// POST /waitlist — join the waitlist
router.post("/", authenticate, WaitlistCtrl.join);

// DELETE /waitlist/:id — leave the waitlist
router.delete("/:id", authenticate, WaitlistCtrl.leave);

export default router;
