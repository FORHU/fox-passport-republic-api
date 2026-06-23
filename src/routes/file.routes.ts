import express from "express";
import FileCtrl from "../controllers/file.controller";
import { authenticate } from "../middleware/auth.middleware";
import multer from "multer";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

router.post("/create", authenticate, FileCtrl.createFile);
router.post("/upload-direct", authenticate, upload.single("file"), FileCtrl.uploadDirect);

export default router;
