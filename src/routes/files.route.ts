import express from "express";
import sessionMiddleware from "../middleware/valid-session.middleware";
import authenticateToken from "../middleware/authenticate-token.middleware";
import FileCtrl from "../controllers/files.controllers";

const router = express.Router();

router.post("/", [sessionMiddleware, authenticateToken], FileCtrl.uploadFile);

export default router;
