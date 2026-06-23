import express from "express";
import ReviewCtrl from "../controllers/review.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = express.Router();

// Public routes (must be before /:id to avoid route conflict)
router.get("/activity", ReviewCtrl.getActivity);
router.get("/listing/:listingId", ReviewCtrl.getListingReviews);
router.get("/user/:userId", authenticate, ReviewCtrl.getUserReviews);

// CRUD routes
router.get("/", ReviewCtrl.getAllReviews);
router.get("/:id", ReviewCtrl.getReviewById);
router.post("/create", authenticate, ReviewCtrl.createReview);
router.put("/:id", authenticate, ReviewCtrl.updateReview);
router.delete("/:id", authenticate, ReviewCtrl.deleteReview);

export default router;
