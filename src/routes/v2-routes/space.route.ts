import express from "express";

import SpaceCtrl from "../../controllers/space.controller";
import optionalAuthMiddleware from "../../middleware/optional-auth.middleware";
import tenantMiddleware from "../../middleware/tenant.middleware";
import tenantValidationMiddleware from "../../middleware/tenant-validation.middleware";
import userLogsMiddleware from "../../middleware/user-logs.middleware";
const router = express.Router();

const groupTenantMiddleware = [tenantMiddleware, tenantValidationMiddleware];

router.get("/most-popular", [optionalAuthMiddleware, userLogsMiddleware, ...groupTenantMiddleware], SpaceCtrl.handleGetMostPopularSpaces);

export default router;
