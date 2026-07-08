import express from "express";
import CancellationPolicyCtrl from "../controllers/cancellation-policy.controller";
import { authenticate, requireAdmin } from "../middleware/auth.middleware";

const router = express.Router();

router.get("/", CancellationPolicyCtrl.getAll);
router.get("/:id", CancellationPolicyCtrl.getById);
router.post("/", authenticate, requireAdmin, CancellationPolicyCtrl.create);
router.put("/:id", authenticate, requireAdmin, CancellationPolicyCtrl.update);
router.delete("/:id", authenticate, requireAdmin, CancellationPolicyCtrl.remove);

export default router;