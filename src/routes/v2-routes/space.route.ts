import express from "express";

import SpaceCtrlV2 from "../../controllers/controller-v2/space.controller";
import optionalAuthMiddleware from "../../middleware/optional-auth.middleware";
import tenantMiddleware from "../../middleware/tenant.middleware";
import userLogsMiddleware from "../../middleware/user-logs.middleware";
const router = express.Router();

router.get("/", [optionalAuthMiddleware, userLogsMiddleware, tenantMiddleware], SpaceCtrlV2.getSpaces);
router.get("/most-popular", [optionalAuthMiddleware, userLogsMiddleware, tenantMiddleware], SpaceCtrlV2.getMostPopularSpaces);

export default router;
