import { Router } from "express";
import MatchController from "./match.controller";
import { authenticate } from "../../middleware/auth.middleware";

const router = Router();

router.post("/", authenticate, MatchController.createMatch);
router.get("/my", authenticate, MatchController.getMyMatches);
router.get("/client-inbox", authenticate, MatchController.getFoxerClientInbox);
router.patch("/:id/accept", authenticate, MatchController.acceptMatch);
router.patch("/:id/decline", authenticate, MatchController.declineMatch);

export default router;
