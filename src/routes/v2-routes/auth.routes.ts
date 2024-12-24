import express from "express";

import AuthCtrl from "../../controllers/controller-v2/auth.controller";
import suspensionMiddleware from "../../middleware/suspension.middleware";
import authenticateToken from "../../middleware/authenticate-token.middleware";
import sessionMiddleware from "../../middleware/valid-session.middleware";
const router = express.Router();

router.post("/registration", AuthCtrl.registrationViaEmail);
router.post("/login", [suspensionMiddleware], AuthCtrl.loginViaEmail);
router.post("/switch", [sessionMiddleware, authenticateToken], AuthCtrl.switchUserRoles);

export default router;
