import express from "express";

import AuthCtrl from "../controllers/user.controller";
import authenticateToken from "../middleware/authenticate-token.middleware";
import sessionMiddleware from "../middleware/valid-session.middleware";
const router = express.Router();

router.get("/me", [sessionMiddleware, authenticateToken], AuthCtrl.getUser);
router.patch("/:id", [sessionMiddleware, authenticateToken], AuthCtrl.updateUser);
router.delete("/", [sessionMiddleware, authenticateToken], AuthCtrl.deleteUser);
router.get("/onboarding-status/:user_id", [sessionMiddleware, authenticateToken], AuthCtrl.getOnboardingStatus);

export default router;
