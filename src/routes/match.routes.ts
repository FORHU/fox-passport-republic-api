import { Router } from "express";
import MatchController from "../controllers/match.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

router.post("/", authenticate, MatchController.createMatch);
router.get("/my", authenticate, MatchController.getMyMatches);

export default router;
