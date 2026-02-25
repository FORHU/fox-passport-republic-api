import express from "express";
import ReviewCtrl from "../controllers/review.controller";

const router = express.Router();

// Review CRUD routes
router.get("/", ReviewCtrl.getAllReviews);
router.get("/:id", ReviewCtrl.getReviewById);
router.get("/listing/:listingId", ReviewCtrl.getListingReviews);
router.get("/user/:userId", ReviewCtrl.getUserReviews);
router.post("/create", ReviewCtrl.createReview);
router.put("/:id", ReviewCtrl.updateReview);
router.delete("/:id", ReviewCtrl.deleteReview);

export default router;
