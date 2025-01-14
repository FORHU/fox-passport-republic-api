import express from "express";

import VenueCtrl from "../controllers/venue.controller";
import authenticateToken from "../middleware/authenticate-token.middleware";
import teamRolesOrganizationMiddleware from "../middleware/team-organization.middleware";
import teamRolesOrganizationPermissionMiddleware from "../middleware/team-organization-permission.middleware";
import tenantMiddleware from "../middleware/tenant.middleware";
import tenantValidationMiddleware from "../middleware/tenant-validation.middleware";
import sessionMiddleware from "../middleware/valid-session.middleware";

const teamOrganizationMiddleware = [teamRolesOrganizationMiddleware, teamRolesOrganizationPermissionMiddleware];
const groupTenantMiddleware = [tenantMiddleware, tenantValidationMiddleware];

const router = express.Router();

router.get("/", [sessionMiddleware, authenticateToken, teamRolesOrganizationMiddleware], VenueCtrl.getVenues);
router.get("/venue-list", [sessionMiddleware, authenticateToken, teamRolesOrganizationMiddleware], VenueCtrl.getVenueNameIdAndStatus);
router.get("/venue-details", [sessionMiddleware, authenticateToken], VenueCtrl.getVenueDetails);
router.get("/count", [sessionMiddleware, authenticateToken], VenueCtrl.countVenue);
router.post("/", [sessionMiddleware, authenticateToken, ...teamOrganizationMiddleware, ...groupTenantMiddleware], VenueCtrl.createVenue);
router.patch("/:venue_id", [sessionMiddleware, authenticateToken, ...teamOrganizationMiddleware], VenueCtrl.updateVenue);
router.delete("/", [sessionMiddleware, authenticateToken, ...teamOrganizationMiddleware], VenueCtrl.deleteMultipleVenues);
router.delete("/:id", [sessionMiddleware, authenticateToken, ...teamOrganizationMiddleware], VenueCtrl.deleteVenue);

// router.post("/transfer-ownership/accept/:token", [sessionMiddleware, authenticateToken], VenueCtrl.transferOwnershipAccept);
router.post("/transfer-ownership/accept/:token", VenueCtrl.transferOwnershipAccept);
router.post("/transfer-ownership/accept/existing/:token", VenueCtrl.transferOwnershipAcceptExisting);

export default router;
