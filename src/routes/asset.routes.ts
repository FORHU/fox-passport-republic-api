import express from "express";
import AssetCtrl from "../controllers/asset.controller";
import {
  authenticate,
  requireRole,
  requireAdmin,
} from "../middleware/auth.middleware";

const router = express.Router();

// Public routes
router.get("/", AssetCtrl.getAssets);
router.get("/:id", AssetCtrl.getAssetById);

// Protected routes
router.post(
  "/create",
  authenticate,
  requireRole(["gearFoxer"]),
  AssetCtrl.createAsset,
);
router.put(
  "/:id",
  authenticate,
  requireRole(["gearFoxer"]),
  AssetCtrl.updateAsset,
);
router.delete(
  "/:id",
  authenticate,
  requireRole(["gearFoxer"]),
  AssetCtrl.deleteAsset,
);

// Admin routes
router.patch(
  "/:id/approve",
  authenticate,
  requireAdmin,
  AssetCtrl.approveAsset,
);
router.patch("/:id/reject", authenticate, requireAdmin, AssetCtrl.rejectAsset);
export default router;
