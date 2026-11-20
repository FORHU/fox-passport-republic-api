import express from "express";
import ProfileCtrl from "./profile.controller";
import {
  authenticate,
  requirePermission,
} from "../../middleware/auth.middleware";

const router = express.Router();

// All profile routes require authentication
router.use(authenticate);

router.get("/", ProfileCtrl.getProfile);
router.put("/", ProfileCtrl.updateProfile);
router.post("/change-password", ProfileCtrl.changePassword);
// A Google account sets the username and password it lacks (api#419).
router.get("/username-availability", ProfileCtrl.checkUsername);
router.post("/credentials", ProfileCtrl.setUpCredentials);
router.delete("/", ProfileCtrl.deleteAccount);

// The EventFoxer's one commission rate for all their Events (#264 T5).
// Only someone who can build event templates has one to set.
router.get(
  "/commission",
  requirePermission("template:manage"),
  ProfileCtrl.getCommission,
);
router.put(
  "/commission",
  requirePermission("template:manage"),
  ProfileCtrl.setCommission,
);

export default router;
