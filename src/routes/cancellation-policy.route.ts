import express from "express";
import sessionMiddleware from "../middleware/valid-session.middleware";
import authenticateToken from "../middleware/authenticate-token.middleware";
import CancellationPolicyCtrl from "../controllers/cancellation-policy.controller";
const router = express.Router();

router.post("/", [sessionMiddleware, authenticateToken], CancellationPolicyCtrl.createCancellationPolicy);
router.get("/", [sessionMiddleware, authenticateToken], CancellationPolicyCtrl.getCancellationPolicy);
router.patch("/:id", [sessionMiddleware, authenticateToken], CancellationPolicyCtrl.updateCancellationPolicy);
router.delete("/:id", [sessionMiddleware, authenticateToken], CancellationPolicyCtrl.deleteCancellationPolicy);

export default router;
