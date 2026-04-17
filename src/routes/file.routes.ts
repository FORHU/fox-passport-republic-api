import express from "express";
import FileCtrl from "../controllers/file.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = express.Router();

router.post("/create", authenticate, FileCtrl.createFile);

export default router;
