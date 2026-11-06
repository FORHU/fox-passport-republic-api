import express from "express";
import FoxerScoreCtrl from "./foxer-score.controller";
import { authenticate } from "../../middleware/auth.middleware";

const router = express.Router();

router.get("/me", authenticate, FoxerScoreCtrl.getMyScore);
router.get("/:userId", FoxerScoreCtrl.getFoxerReputation);

export default router;
