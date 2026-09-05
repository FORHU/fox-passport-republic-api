import { Router } from "express";
import FeedController from "./feed.controller";
import { authenticate, optionalAuth } from "../../middleware/auth.middleware";

const router = Router();

// Publicly readable feed with optional authentication (to detect isLikedByMe)
router.get("/", optionalAuth, FeedController.getFeed);
router.get("/:id", optionalAuth, FeedController.getPostById);

// Post interactions requiring authentication
router.post("/", authenticate, FeedController.createPost);
router.delete("/:id", authenticate, FeedController.deletePost);
router.post("/:id/like", authenticate, FeedController.toggleLike);

// Comments
router.get("/:id/comments", optionalAuth, FeedController.getComments);
router.post("/:id/comments", authenticate, FeedController.addComment);
router.delete("/:id/comments/:commentId", authenticate, FeedController.deleteComment);

export default router;
