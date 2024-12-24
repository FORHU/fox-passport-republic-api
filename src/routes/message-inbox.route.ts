import express from "express";

import MessageCtrl from "../controllers/message-inbox.controller";
import authenticateToken from "../middleware/authenticate-token.middleware";
import sessionMiddleware from "../middleware/valid-session.middleware";

const router = express.Router();

router.get("/", [sessionMiddleware, authenticateToken], MessageCtrl.getMessages);

export default router;
