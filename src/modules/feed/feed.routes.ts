import { Router } from "express";
import FeedController from "./feed.controller";
import { authenticate, optionalAuth } from "../../middleware/auth.middleware";

const router = Router();

// Publicly readable feed with optional authentication (to detect isLikedByMe)
router.get("/", optionalAuth, FeedController.getFeed);
// Static sub-paths before the "/:id" catch-all so they aren't swallowed by it.
router.get("/saved", authenticate, FeedController.getSavedPosts);
router.get("/mentions/search", authenticate, FeedController.searchMentions);
router.get("/:id", optionalAuth, FeedController.getPostById);

// Post interactions requiring authentication
router.post("/", authenticate, FeedController.createPost);
router.patch("/:id", authenticate, FeedController.editPost);
router.delete("/:id", authenticate, FeedController.deletePost);
router.post("/:id/repost", authenticate, FeedController.repost);
router.post("/:id/reaction", authenticate, FeedController.setReaction);
router.get("/:id/reactions", FeedController.getReactionBreakdown);
router.post("/:id/save", authenticate, FeedController.toggleSave);
router.post("/:id/hide", authenticate, FeedController.hidePost);

// Comments
router.get("/:id/comments", optionalAuth, FeedController.getComments);
router.post("/:id/comments", authenticate, FeedController.addComment);
router.delete(
  "/:id/comments/:commentId",
  authenticate,
  FeedController.deleteComment,
);
router.post(
  "/:id/comments/:commentId/like",
  authenticate,
  FeedController.toggleCommentLike,
);

export default router;
