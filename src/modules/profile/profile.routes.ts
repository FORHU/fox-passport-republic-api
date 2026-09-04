import express from "express";
import ProfileCtrl from "./profile.controller";
import { authenticate } from "../../middleware/auth.middleware";

const router = express.Router();

// All profile routes require authentication
router.use(authenticate);

router.get("/", ProfileCtrl.getProfile);
router.put("/", ProfileCtrl.updateProfile);
router.post("/change-password", ProfileCtrl.changePassword);
router.delete("/", ProfileCtrl.deleteAccount);

export default router;
