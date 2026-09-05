import express from "express";
import AssetCtrl from "./asset.controller";
import {
  authenticate,
  requirePermission,
} from "../../middleware/auth.middleware";

const router = express.Router();

// Public routes
router.get("/", AssetCtrl.getAssets);
router.get("/browse", AssetCtrl.browseAssets);
router.get("/:id", AssetCtrl.getAssetById);

// Protected routes
router.post(
  "/create",
  authenticate,
  requirePermission("asset:manage"),
  AssetCtrl.createAsset,
);
router.put(
  "/:id",
  authenticate,
  requirePermission("asset:manage"),
  AssetCtrl.updateAsset,
);
router.delete(
  "/:id",
  authenticate,
  requirePermission("asset:manage"),
  AssetCtrl.deleteAsset,
);

// Approve/reject moved to admin.routes.ts (AdminCtrl) — this pair had
// diverged from it (no XP award, no socket announce) and this app only ever
// called the admin path. See docs/TOMORROW.md.

export default router;
