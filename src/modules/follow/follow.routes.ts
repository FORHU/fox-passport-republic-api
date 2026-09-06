import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import FollowController from "./follow.controller";

const router = Router();

// Toggle follow/unfollow (requires targetId in body)
router.post("/", authenticate, FollowController.toggleFollow);

// Get suggestions for current user
router.get("/suggestions", authenticate, FollowController.getSuggestions);

// Get status of current user following a specific user
router.get("/:userId/status", authenticate, FollowController.getStatus);

// Get counts (followers/following) for a user
router.get("/:userId/counts", FollowController.getCounts);

// Get followers list
router.get("/:userId/followers", FollowController.getFollowers);

// Get following list
router.get("/:userId/following", FollowController.getFollowing);

export default router;
