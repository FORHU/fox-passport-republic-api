import { Router } from "express";
import multer from "multer";
import IdentityVerificationCtrl from "./identity-verification.controller";
import {
  authenticate,
  requirePermission,
} from "../../middleware/auth.middleware";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB per file, as role applications
});

const documents = upload.fields([
  { name: "idFile", maxCount: 1 },
  { name: "selfieFile", maxCount: 1 },
]);

const router = Router();

router.get("/me", authenticate, IdentityVerificationCtrl.getMine);
router.post("/", authenticate, documents, IdentityVerificationCtrl.submit);

// Admin review — the same people who manage user accounts.
router.get(
  "/",
  authenticate,
  requirePermission("users:manage"),
  IdentityVerificationCtrl.list,
);
router.patch(
  "/:id/review",
  authenticate,
  requirePermission("users:manage"),
  IdentityVerificationCtrl.review,
);

export default router;
