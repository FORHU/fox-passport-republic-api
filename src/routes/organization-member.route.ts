import express from "express";

import OrganizationMemberCtrl from "../controllers/organization-member.controller";
import authenticateToken from "../middleware/authenticate-token.middleware";
import sessionMiddleware from "../middleware/valid-session.middleware";
import tenantMiddleware from "../middleware/tenant.middleware";
import tenantValidationMiddleware from "../middleware/tenant-validation.middleware";

const router = express.Router();

const TENANT_MIDDLEWARE = [tenantMiddleware, tenantValidationMiddleware];

router.post("/team-invite", [sessionMiddleware, authenticateToken, ...TENANT_MIDDLEWARE], OrganizationMemberCtrl.teamMemberInvitation);
router.post("/accepted-invite/:token", OrganizationMemberCtrl.acceptInvitation);
router.get("/", [sessionMiddleware, authenticateToken], OrganizationMemberCtrl.getOrganizationMembers);
router.delete("/:id", [sessionMiddleware, authenticateToken], OrganizationMemberCtrl.deleteOrganizationMember);
router.patch("/:id", [sessionMiddleware, authenticateToken], OrganizationMemberCtrl.updateOrganizationMember);

export default router;
