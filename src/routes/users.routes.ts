import express from "express";
import UsersCtrl from "../controllers/users.controller";
import { authenticate, requireAdmin } from "../middleware/auth.middleware";

const router = express.Router();

// Public routes (must be before /:id)
router.get("/foxers", UsersCtrl.getFoxers);
router.get("/foxers/me/stats", authenticate, UsersCtrl.getFoxerStats);
router.get("/foxers/:id", UsersCtrl.getFoxerById);

// Authenticated routes
router.post("/become-host", authenticate, UsersCtrl.becomeHost);

// Public — individual profile lookup
router.get("/:id", UsersCtrl.getUserById);

// Admin only
router.get("/", authenticate, requireAdmin, UsersCtrl.getAllUsers);
router.post("/", authenticate, requireAdmin, UsersCtrl.createUser);
router.put("/:id", authenticate, requireAdmin, UsersCtrl.updateUserById);
router.delete("/:id", authenticate, requireAdmin, UsersCtrl.deleteUserById);

export default router;
