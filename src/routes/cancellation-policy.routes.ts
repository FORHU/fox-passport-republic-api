import express from "express";
import CancellationPolicyCtrl from "../controllers/cancellation-policy.controller";
import { authenticate, requirePermission } from "../middleware/auth.middleware";

const router = express.Router();

router.get("/", CancellationPolicyCtrl.getAll);
router.get("/:id", CancellationPolicyCtrl.getById);
router.post(
  "/",
  authenticate,
  requirePermission("policies:manage"),
  CancellationPolicyCtrl.create,
);
router.put(
  "/:id",
  authenticate,
  requirePermission("policies:manage"),
  CancellationPolicyCtrl.update,
);
router.delete(
  "/:id",
  authenticate,
  requirePermission("policies:manage"),
  CancellationPolicyCtrl.remove,
);

export default router;
