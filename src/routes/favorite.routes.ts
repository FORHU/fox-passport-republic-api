import express from "express";
import FavoriteCtrl from "../controllers/favorite.controller";

const router = express.Router();

// Favorite routes
router.get("/user/:userId", FavoriteCtrl.getUserFavorites);
router.get("/check", FavoriteCtrl.checkFavorite);
router.post("/add", FavoriteCtrl.addFavorite);
router.delete("/:id", FavoriteCtrl.removeFavorite);
router.delete("/remove/event", FavoriteCtrl.removeFavoriteByEvent);

export default router;
