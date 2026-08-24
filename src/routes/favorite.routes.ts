import express from "express";
import FavoriteCtrl from "../controllers/favorite.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = express.Router();

// Favorite routes
router.get("/user/:userId", authenticate, FavoriteCtrl.getUserFavorites);
router.get("/check", authenticate, FavoriteCtrl.checkFavorite);
router.post("/add", authenticate, FavoriteCtrl.addFavorite);
router.delete("/:id", authenticate, FavoriteCtrl.removeFavorite);
router.delete(
  "/remove/listing",
  authenticate,
  FavoriteCtrl.removeFavoriteByListing,
);

export default router;
