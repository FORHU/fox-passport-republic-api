import express from "express";
const router = express.Router();

import RatingCtrl from "../controllers/rating.controller";
import authenticateToken from "../middleware/authenticate-token.middleware";
import sessionMiddleware from "../middleware/valid-session.middleware";

//getting rating for a space by a user
router.get("/:space_id", [authenticateToken, sessionMiddleware], RatingCtrl.getRating);

//getting overall rating for a space
router.get("/overall/:space_id", RatingCtrl.getOverAllRating);

//creating and updating a rating for a space
router.post("/:space_id", [authenticateToken, sessionMiddleware], RatingCtrl.createRating);

export default router;
