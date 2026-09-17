import express from "express";
import PlatformFeeConfigCtrl from "./platform-fee-config.controller";
import {
  authenticate,
  requirePermission,
} from "../../middleware/auth.middleware";

const router = express.Router();

// Admin-only throughout — unlike cancellation policies, citizens never need
// to see platform fee rules directly (the fee is folded into the price
// they're shown, not a policy they choose between).
router.get(
  "/",
  authenticate,
  requirePermission("fees:manage"),
  PlatformFeeConfigCtrl.getAll,
);
router.get(
  "/preview",
  authenticate,
  requirePermission("fees:manage"),
  PlatformFeeConfigCtrl.preview,
);
router.get(
  "/:id",
  authenticate,
  requirePermission("fees:manage"),
  PlatformFeeConfigCtrl.getById,
);
router.post(
  "/",
  authenticate,
  requirePermission("fees:manage"),
  PlatformFeeConfigCtrl.create,
);
router.put(
  "/:id",
  authenticate,
  requirePermission("fees:manage"),
  PlatformFeeConfigCtrl.update,
);
router.delete(
  "/:id",
  authenticate,
  requirePermission("fees:manage"),
  PlatformFeeConfigCtrl.remove,
);

export default router;
