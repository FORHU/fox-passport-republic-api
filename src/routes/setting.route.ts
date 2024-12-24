import express from "express";

import authenticateToken from "../middleware/authenticate-token.middleware";
import optionalAuthMiddleware from "../middleware/optional-auth.middleware";
import userLogsMiddleware from "../middleware/user-logs.middleware";
import sessionMiddleware from "../middleware/valid-session.middleware";
import SalesSettingCtrl from "../controllers/setting.controller";

const router = express.Router();

router.post("/", [sessionMiddleware, authenticateToken], SalesSettingCtrl.createOrUpdateSetting);
router.get("/", [sessionMiddleware, optionalAuthMiddleware, userLogsMiddleware], SalesSettingCtrl.getSettings);

export default router;
