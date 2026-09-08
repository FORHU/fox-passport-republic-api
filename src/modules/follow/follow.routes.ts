import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import FollowController from "./follow.controller";

const router = Router();

// Send a follow (instant if target is public, pending if private)
router.post("/", authenticate, FollowController.sendFollow);

// Unfollow, or cancel an outgoing pending request
router.delete("/:targetId", authenticate, FollowController.removeFollow);

// Accept / decline an incoming pending request
router.post(
  "/:requesterId/accept",
  authenticate,
  FollowController.acceptRequest,
);
router.post(
  "/:requesterId/decline",
  authenticate,
  FollowController.declineRequest,
);

// Incoming pending requests for the current user
router.get("/requests", authenticate, FollowController.getRequests);

// Get suggestions for current user
router.get("/suggestions", authenticate, FollowController.getSuggestions);

// Get status of current user following a specific user
router.get("/:userId/status", authenticate, FollowController.getStatus);

// Get counts (followers/following) for a user
router.get("/:userId/counts", authenticate, FollowController.getCounts);

// Get followers list
router.get("/:userId/followers", authenticate, FollowController.getFollowers);

// Get following list
router.get("/:userId/following", authenticate, FollowController.getFollowing);

export default router;
