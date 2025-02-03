import express from "express";

import EnquiriesCtrl from "../controllers/enquiries.controller";
import authenticateToken from "../middleware/authenticate-token.middleware";
import teamRolesOrganizationMiddleware from "../middleware/team-organization.middleware";
import teamRolesOrganizationPermissionMiddleware from "../middleware/team-organization-permission.middleware";
import sessionMiddleware from "../middleware/valid-session.middleware";
import tenantMiddleware from "../middleware/tenant.middleware";

const teamOrganizationMiddleware = [teamRolesOrganizationMiddleware, teamRolesOrganizationPermissionMiddleware];

const router = express.Router();

router.get("/", [sessionMiddleware, authenticateToken, teamRolesOrganizationMiddleware, tenantMiddleware], EnquiriesCtrl.getEnquiries);
router.get("/count/status", [sessionMiddleware, authenticateToken, tenantMiddleware], EnquiriesCtrl.countAllEnquiries);
router.get("/:id", [sessionMiddleware, authenticateToken, tenantMiddleware], EnquiriesCtrl.getEnquiry);
router.post("/", [sessionMiddleware, authenticateToken, tenantMiddleware, ...teamOrganizationMiddleware], EnquiriesCtrl.createEnquiries);
router.get("/space-photo", [sessionMiddleware, authenticateToken, tenantMiddleware], EnquiriesCtrl.getOneEnquiryPhoto);
router.patch("/:id", [sessionMiddleware, authenticateToken, tenantMiddleware, ...teamOrganizationMiddleware], EnquiriesCtrl.updateEnquiries);

export default router;
