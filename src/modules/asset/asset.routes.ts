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

// Admin routes
router.patch(
  "/:id/approve",
  authenticate,
  requirePermission("queue:decide"),
  AssetCtrl.approveAsset,
);
router.patch(
  "/:id/reject",
  authenticate,
  requirePermission("queue:decide"),
  AssetCtrl.rejectAsset,
);
export default router;
