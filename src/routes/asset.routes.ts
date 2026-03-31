import express from "express";
import AssetCtrl from "../controllers/asset.controller";
import { authenticate } from "../middleware/auth.middleware"; // reuse your existing auth middleware
import { upload } from "../middleware/fileUpload";

const router = express.Router();

// Public routes
router.get("/", AssetCtrl.getAssets);
router.get("/:id", AssetCtrl.getAssetById);

// Protected routes — require JWT
router.post("/", authenticate, upload.array("images", 10), AssetCtrl.createAsset);
router.post("/create", authenticate, upload.array("images", 10), AssetCtrl.createAsset);

router.put("/:id", authenticate, AssetCtrl.updateAsset);
router.delete("/:id", authenticate, AssetCtrl.deleteAsset);

// Image management handlers
router.post("/:id/images", authenticate, upload.array("images", 10), AssetCtrl.uploadAssetImages);
router.put("/images/:imageId", authenticate, AssetCtrl.updateAssetImage);
router.delete("/images/:imageId", authenticate, AssetCtrl.deleteAssetImage);

// rental endpoints
router.get("/:id/rentals", AssetCtrl.getAssetRentals);
router.post("/:id/rent", authenticate, AssetCtrl.rentAsset);

export default router;