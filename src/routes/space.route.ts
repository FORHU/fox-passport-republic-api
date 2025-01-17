import express from "express";

import SpaceCtrl from "../controllers/space.controller";
import authenticateToken from "../middleware/authenticate-token.middleware";
import optionalAuthMiddleware from "../middleware/optional-auth.middleware";
import teamRolesOrganizationMiddleware from "../middleware/team-organization.middleware";
import teamRolesOrganizationPermissionMiddleware from "../middleware/team-organization-permission.middleware";
import tenantMiddleware from "../middleware/tenant.middleware";
import userLogsMiddleware from "../middleware/user-logs.middleware";
import sessionMiddleware from "../middleware/valid-session.middleware";

const teamOrganizationMiddleware = [teamRolesOrganizationMiddleware, teamRolesOrganizationPermissionMiddleware];

const router = express.Router();

router.get("/", [optionalAuthMiddleware, userLogsMiddleware, tenantMiddleware], SpaceCtrl.getSpaces);
router.get("/count/:id", [sessionMiddleware, authenticateToken, tenantMiddleware], SpaceCtrl.countSpace);
router.get("/most-popular", [optionalAuthMiddleware, userLogsMiddleware, tenantMiddleware], SpaceCtrl.getMostPopularSpaces);
router.get("/recently-listed", [optionalAuthMiddleware, userLogsMiddleware, tenantMiddleware], SpaceCtrl.getRecentlyListedSpaces);
router.get("/subscribed", [optionalAuthMiddleware, userLogsMiddleware], SpaceCtrl.getSpaceList);
router.get("/space-list", [optionalAuthMiddleware, userLogsMiddleware, tenantMiddleware], SpaceCtrl.getSpaceNameIdAndStatus);
router.post("/", [sessionMiddleware, authenticateToken, userLogsMiddleware, ...teamOrganizationMiddleware], SpaceCtrl.createSpaces);
router.post("/coordinates", SpaceCtrl.getCoordinates);
router.patch("/:id", [sessionMiddleware, authenticateToken, userLogsMiddleware, ...teamOrganizationMiddleware], SpaceCtrl.updateSpaces);
router.delete("/:id", [sessionMiddleware, authenticateToken, userLogsMiddleware, ...teamOrganizationMiddleware], SpaceCtrl.markSpaceForDeletion);
router.delete("/", [sessionMiddleware, authenticateToken, userLogsMiddleware, ...teamOrganizationMiddleware], SpaceCtrl.deleteMultipleSpaces);

export default router;
