import express from "express";
import sessionMiddleware from "../middleware/valid-session.middleware";
import authenticateToken from "../middleware/authenticate-token.middleware";
import KeywordsCtrl from "../controllers/keyword.controller";

const router = express.Router();

router.get("/", [sessionMiddleware, authenticateToken], KeywordsCtrl.getKeywords);
router.post("/", [sessionMiddleware, authenticateToken], KeywordsCtrl.createKeywords);
router.patch("/", [sessionMiddleware, authenticateToken], KeywordsCtrl.updateKeywords);

export default router;
