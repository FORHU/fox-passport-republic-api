import express from "express";
import AssetCtrl from "../controllers/asset.controller";
import { authenticate, requireRole } from "../middleware/auth.middleware";

const router = express.Router();

// Public routes
router.get("/", AssetCtrl.getAssets);
router.get("/:id", AssetCtrl.getAssetById);

// Protected routes
router.post("/create", authenticate, requireRole(["foxerAsset"]), AssetCtrl.createAsset);
router.put("/:id", authenticate, requireRole(["foxerAsset"]), AssetCtrl.updateAsset);
router.delete("/:id", authenticate, requireRole(["foxerAsset"]), AssetCtrl.deleteAsset);
export default router;