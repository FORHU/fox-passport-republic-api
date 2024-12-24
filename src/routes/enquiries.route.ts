import express from "express";

import EnquiriesCtrl from "../controllers/enquiries.controller";
import authenticateToken from "../middleware/authenticate-token.middleware";
import teamRolesOrganizationMiddleware from "../middleware/team-organization.middleware";
import teamRolesOrganizationPermissionMiddleware from "../middleware/team-organization-permission.middleware";
import sessionMiddleware from "../middleware/valid-session.middleware";

const teamOrganizationMiddleware = [teamRolesOrganizationMiddleware, teamRolesOrganizationPermissionMiddleware];

const router = express.Router();

router.get("/", [sessionMiddleware, authenticateToken, teamRolesOrganizationMiddleware], EnquiriesCtrl.getEnquiries);
router.get("/count/status", [sessionMiddleware, authenticateToken], EnquiriesCtrl.countAllEnquiries);
router.get("/:id", [sessionMiddleware, authenticateToken], EnquiriesCtrl.getEnquiry);
router.post("/", [sessionMiddleware, authenticateToken, ...teamOrganizationMiddleware], EnquiriesCtrl.createEnquiries);
router.get("/space-photo", [sessionMiddleware, authenticateToken], EnquiriesCtrl.getOneEnquiryPhoto);
router.patch("/:id", [sessionMiddleware, authenticateToken, ...teamOrganizationMiddleware], EnquiriesCtrl.updateEnquiries);

export default router;
