import express from "express";
import { S3Controller } from "../controllers/s3.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = express.Router();

router.post("/get-presigned-url", authenticate, S3Controller.getPutUrl);
router.get("/get-cloudfront-url", authenticate, S3Controller.getGetUrl);

export default router;
