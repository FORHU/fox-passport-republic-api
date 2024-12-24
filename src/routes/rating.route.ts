import express from "express";
const router = express.Router();

import RatingCtrl from "../controllers/rating.controller";
import authenticateToken from "../middleware/authenticate-token.middleware";
import sessionMiddleware from "../middleware/valid-session.middleware";

router.get("/:space_id", [authenticateToken, sessionMiddleware], RatingCtrl.getRating);
router.get("/overall/:space_id", [authenticateToken, sessionMiddleware], RatingCtrl.getOverAllRating);
router.post("/:space_id", [authenticateToken, sessionMiddleware], RatingCtrl.createRating);

export default router;
