import express from "express";
import AssetCtrl from "../controllers/asset.controller";
import { authenticate } from "../middleware/auth.middleware"; // reuse your existing auth middleware

const router = express.Router();

// Public routes
router.get("/", AssetCtrl.getAssets);
router.get("/:id", AssetCtrl.getAssetById);

// Protected routes — require JWT
router.post("/create", authenticate, AssetCtrl.createAsset);
router.put("/:id", authenticate, AssetCtrl.updateAsset);
router.delete("/:id", authenticate, AssetCtrl.deleteAsset);
export default router;