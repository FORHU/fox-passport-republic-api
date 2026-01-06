import express from "express";
import UsersCtrl from "../controllers/users.controller";
import UserController from "../controllers/user.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = express.Router();

router.get("/", UsersCtrl.getAllUsers);
router.get("/:id", UsersCtrl.getUserById);
router.post("/", UsersCtrl.createUser);
router.put("/:id", UsersCtrl.updateUserById); // ✅ UPDATE
router.delete("/:id", UsersCtrl.deleteUserById);

// New routes for user profile and host upgrade
router.get("/profile/me", authenticate, UserController.getProfile);
router.post("/become-host", authenticate, UserController.becomeHost);

export default router;
