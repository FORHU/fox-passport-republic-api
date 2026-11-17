import express from "express";
import RewardAdminCtrl from "./reward-admin.controller";
import {
  authenticate,
  requirePermission,
} from "../../middleware/auth.middleware";

const router = express.Router();

// Admin only, every route. Nothing here writes a Token balance; these are the
// rules, milestones, challenges and rewards the system earns and spends by.
// Each route names its guard in full so tools/validate-rbac-guards.mjs can see it.

// --- Reward rules (edited, never created or deleted) ----------------------
router.get(
  "/rules",
  authenticate,
  requirePermission("rewards:manage"),
  RewardAdminCtrl.listRules,
);
router.get(
  "/rules/:id",
  authenticate,
  requirePermission("rewards:manage"),
  RewardAdminCtrl.getRule,
);
router.patch(
  "/rules/:id",
  authenticate,
  requirePermission("rewards:manage"),
  RewardAdminCtrl.updateRule,
);
router.get(
  "/rules/:id/history",
  authenticate,
  requirePermission("rewards:manage"),
  RewardAdminCtrl.history,
);

// --- Milestones and their tiers -------------------------------------------
router.get(
  "/milestones",
  authenticate,
  requirePermission("rewards:manage"),
  RewardAdminCtrl.listMilestones,
);
router.post(
  "/milestones",
  authenticate,
  requirePermission("rewards:manage"),
  RewardAdminCtrl.createMilestone,
);
router.get(
  "/milestones/:id",
  authenticate,
  requirePermission("rewards:manage"),
  RewardAdminCtrl.getMilestone,
);
router.patch(
  "/milestones/:id",
  authenticate,
  requirePermission("rewards:manage"),
  RewardAdminCtrl.updateMilestone,
);
router.get(
  "/milestones/:id/history",
  authenticate,
  requirePermission("rewards:manage"),
  RewardAdminCtrl.history,
);
router.post(
  "/milestones/:id/tiers",
  authenticate,
  requirePermission("rewards:manage"),
  RewardAdminCtrl.createTier,
);
router.patch(
  "/milestones/:id/tiers/:tier",
  authenticate,
  requirePermission("rewards:manage"),
  RewardAdminCtrl.updateTier,
);
router.delete(
  "/milestones/:id/tiers/:tier",
  authenticate,
  requirePermission("rewards:manage"),
  RewardAdminCtrl.deleteTier,
);

// --- Challenges ------------------------------------------------------------
router.get(
  "/challenges",
  authenticate,
  requirePermission("rewards:manage"),
  RewardAdminCtrl.listChallenges,
);
router.post(
  "/challenges",
  authenticate,
  requirePermission("rewards:manage"),
  RewardAdminCtrl.createChallenge,
);
router.get(
  "/challenges/:id",
  authenticate,
  requirePermission("rewards:manage"),
  RewardAdminCtrl.getChallenge,
);
router.patch(
  "/challenges/:id",
  authenticate,
  requirePermission("rewards:manage"),
  RewardAdminCtrl.updateChallenge,
);
router.get(
  "/challenges/:id/history",
  authenticate,
  requirePermission("rewards:manage"),
  RewardAdminCtrl.history,
);

// --- Rewards catalogue (switched off, never deleted) -----------------------
router.get(
  "/catalog",
  authenticate,
  requirePermission("rewards:manage"),
  RewardAdminCtrl.listCatalog,
);
router.post(
  "/catalog",
  authenticate,
  requirePermission("rewards:manage"),
  RewardAdminCtrl.createCatalogItem,
);
router.get(
  "/catalog/:id",
  authenticate,
  requirePermission("rewards:manage"),
  RewardAdminCtrl.getCatalogItem,
);
router.patch(
  "/catalog/:id",
  authenticate,
  requirePermission("rewards:manage"),
  RewardAdminCtrl.updateCatalogItem,
);
router.get(
  "/catalog/:id/history",
  authenticate,
  requirePermission("rewards:manage"),
  RewardAdminCtrl.history,
);

export default router;
