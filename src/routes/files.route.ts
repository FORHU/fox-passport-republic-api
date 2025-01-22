import express from "express";

import FileCtrl from "../controllers/files.controllers";
import authenticateToken from "../middleware/authenticate-token.middleware";
import sessionMiddleware from "../middleware/valid-session.middleware";

const router = express.Router();

router.post("/", [sessionMiddleware, authenticateToken], FileCtrl.uploadFile);
router.get("/download/:id", FileCtrl.downloadFile);

export default router;
