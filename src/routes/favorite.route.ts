import express from "express";

import FavoriteCtrl from "../controllers/favorite.controller";
import authenticateToken from "../middleware/authenticate-token.middleware";
import sessionMiddleware from "../middleware/valid-session.middleware";

const router = express.Router();

router.post("/", [sessionMiddleware, authenticateToken], FavoriteCtrl.createFavorite);
router.get("/folders", [sessionMiddleware, authenticateToken], FavoriteCtrl.getMarkedAsFavorite);
router.get("/folders/:id", [sessionMiddleware, authenticateToken], FavoriteCtrl.getFavoritesByFolder);

router.get("/group-favorite", [sessionMiddleware, authenticateToken], FavoriteCtrl.groupFavorite);
router.get("/view-logs", [sessionMiddleware, authenticateToken], FavoriteCtrl.viewLogs);

router.patch("/:id", [sessionMiddleware, authenticateToken], FavoriteCtrl.updateMarkedAsFavorite);
router.patch("/assign-folder/:favorite_id", [sessionMiddleware, authenticateToken], FavoriteCtrl.assignToFavoriteFolder);
router.patch("/folders/:id", [sessionMiddleware, authenticateToken], FavoriteCtrl.updateFavoriteFolder);

router.delete("/folders/:id", [sessionMiddleware, authenticateToken], FavoriteCtrl.deleteFavoriteFolder);

router.delete("/view-logs/:id", [sessionMiddleware, authenticateToken], FavoriteCtrl.deleteViewLogs);

export default router;
