import express from "express";

import SpaceCtrl from "../../controllers/space.controller";
import optionalAuthMiddleware from "../../middleware/optional-auth.middleware";
import userLogsMiddleware from "../../middleware/user-logs.middleware";
const router = express.Router();

router.get("/most-popular", [optionalAuthMiddleware, userLogsMiddleware], SpaceCtrl.handleGetMostPopularSpaces);

export default router;
