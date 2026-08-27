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

// Individual profile lookup.
//
// Was public and returned a bare `prisma.user.findUnique`, so it published the
// password hash along with email, phone, address and Stripe ids. It has no
// caller in the app — the client uses `/users/foxers/:id` for public profiles —
// so it is authenticated now, and the service returns an explicit field list
// rather than the whole row.
router.get("/:id", authenticate, UsersCtrl.getUserById);

// Admin only
router.get("/", authenticate, requireAdmin, UsersCtrl.getAllUsers);
router.post("/", authenticate, requireAdmin, UsersCtrl.createUser);
router.put("/:id", authenticate, requireAdmin, UsersCtrl.updateUserById);
router.delete("/:id", authenticate, requireAdmin, UsersCtrl.deleteUserById);

export default router;
