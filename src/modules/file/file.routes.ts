import express from "express";
import FileCtrl from "./file.controller";
import { authenticate } from "../../middleware/auth.middleware";
import multer from "multer";

const router = express.Router();
// Ceiling for any upload at the multer layer — video posts need more room
// than images; S3Svc.uploadFile enforces the tighter per-type limit (15MB
// images, 100MB video) after this.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

router.post("/create", authenticate, FileCtrl.createFile);
router.post(
  "/upload-direct",
  authenticate,
  upload.single("file"),
  FileCtrl.uploadDirect,
);

// Identity documents: images or PDFs, 15MB, into the private bucket.
const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});
router.post(
  "/upload-private",
  authenticate,
  documentUpload.single("file"),
  FileCtrl.uploadPrivate,
);

export default router;
