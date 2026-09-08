import { Router } from "express";
import RoleRequestController from "./role-request.controller";
import {
  authenticate,
  requirePermission,
} from "../../middleware/auth.middleware";
import multer from "multer";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB per file
});

// The file fields accepted in a role application
const applicationFiles = upload.fields([
  { name: "validId1", maxCount: 1 },
  { name: "nbiFile", maxCount: 1 },
  { name: "tinIdFile", maxCount: 1 },
  { name: "birPermitFile", maxCount: 1 },
  { name: "selfieFile", maxCount: 1 },
  { name: "portfolioFile", maxCount: 1 }, // host applications only
]);

const router = Router();

// User routes
router.get("/my", authenticate, RoleRequestController.listMine);
router.post(
  "/apply",
  authenticate,
  applicationFiles,
  RoleRequestController.apply,
);

// Admin routes
router.get(
  "/list",
  authenticate,
  requirePermission("roles:manage"),
  RoleRequestController.list,
);
router.patch(
  "/review/:id",
  authenticate,
  requirePermission("roles:manage"),
  RoleRequestController.review,
);

export default router;
