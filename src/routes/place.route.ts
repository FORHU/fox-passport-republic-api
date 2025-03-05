import express from "express";
import PlaceController from "../controllers/place.controller";
import authenticateToken from "../middleware/authenticate-token.middleware";
import sessionMiddleware from "../middleware/valid-session.middleware";

const defaultMiddleware = [sessionMiddleware, authenticateToken];

const router = express.Router();

router.get("/auto-complete", [...defaultMiddleware], PlaceController.getCompleteAddress);

export default router;
