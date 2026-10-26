import express from "express";
import UsersCtrl from "./users.controller";
import {
  authenticate,
  optionalAuth,
  requirePermission,
} from "../../middleware/auth.middleware";
import { asyncHandler } from "../../utils/async-handler";

const router = express.Router();

// Public routes (must be before /:id)
router.get("/foxers", UsersCtrl.getFoxers);
router.get("/foxers/me/stats", authenticate, UsersCtrl.getFoxerStats);
router.get("/foxers/:id", UsersCtrl.getFoxerById);
// Public, but read with the session when there is one: the person viewing
// their own profile sees their stamps in full (UsersSvc.getPublicProfile).
router.get("/profile/:id", optionalAuth, UsersCtrl.getPublicProfile);
router.get("/:id/public", optionalAuth, UsersCtrl.getPublicProfile);
router.get("/:id/presence", authenticate, UsersCtrl.getPresence);

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
router.get(
  "/",
  authenticate,
  requirePermission("users:read"),
  asyncHandler(UsersCtrl.getAllUsers),
);
router.post(
  "/",
  authenticate,
  requirePermission("users:manage"),
  UsersCtrl.createUser,
);
router.put(
  "/:id",
  authenticate,
  requirePermission("users:manage"),
  UsersCtrl.updateUserById,
);
router.delete(
  "/:id",
  authenticate,
  requirePermission("users:manage"),
  asyncHandler(UsersCtrl.deleteUserById),
);

export default router;
