import express from "express";
import UsersCtrl from "../controllers/users.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = express.Router();

// Public routes (must be before /:id)
router.get("/foxers", UsersCtrl.getFoxers);
router.get("/foxers/me/stats", authenticate, UsersCtrl.getFoxerStats);
router.get("/foxers/:id", UsersCtrl.getFoxerById);

// Authenticated routes
router.post("/become-host", authenticate, UsersCtrl.becomeHost);

router.get("/", UsersCtrl.getAllUsers);
router.get("/:id", UsersCtrl.getUserById);
router.post("/", UsersCtrl.createUser);
router.put("/:id", UsersCtrl.updateUserById);
router.delete("/:id", UsersCtrl.deleteUserById);

export default router;

