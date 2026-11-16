import express from "express";
import RewardSettingsCtrl from "./reward-settings.controller";
import {
  authenticate,
  requirePermission,
} from "../../middleware/auth.middleware";

const router = express.Router();

// Admin only, throughout. Nothing here writes a Token balance: these are the
// rules and limits the system earns by, never a person's Tokens.
router.get(
  "/",
  authenticate,
  requirePermission("rewards:manage"),
  RewardSettingsCtrl.list,
);
router.get(
  "/:key/history",
  authenticate,
  requirePermission("rewards:manage"),
  RewardSettingsCtrl.history,
);
router.put(
  "/:key",
  authenticate,
  requirePermission("rewards:manage"),
  RewardSettingsCtrl.set,
);
router.delete(
  "/:key",
  authenticate,
  requirePermission("rewards:manage"),
  RewardSettingsCtrl.reset,
);

export default router;
