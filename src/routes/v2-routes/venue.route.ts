import express from "express";

import VenueCtrl from "../../controllers/controller-v2/venue.contoller";
import authenticateToken from "../../middleware/authenticate-token.middleware";
import teamRolesOrganizationMiddleware from "../../middleware/team-organization.middleware";
import teamRolesOrganizationPermissionMiddleware from "../../middleware/team-organization-permission.middleware";
import tenantMiddleware from "../../middleware/tenant.middleware";
import tenantValidationMiddleware from "../../middleware/tenant-validation.middleware";
import sessionMiddleware from "../../middleware/valid-session.middleware";

const defaultMiddleware = [sessionMiddleware, authenticateToken];
const teamOrganizationMiddleware = [teamRolesOrganizationMiddleware, teamRolesOrganizationPermissionMiddleware];
const groupTenantMiddleware = [tenantMiddleware, tenantValidationMiddleware];

const router = express.Router();

router.post("/", [...defaultMiddleware, ...teamOrganizationMiddleware, ...groupTenantMiddleware], VenueCtrl.createVenue);
router.get("/get-venue-name", [...defaultMiddleware, ...teamOrganizationMiddleware, ...groupTenantMiddleware], VenueCtrl.getVenueName);
// router.get("/", [...defaultMiddleware, teamRolesOrganizationMiddleware, tenantMiddleware], VenueCtrl.getVenues);

// router.get("/venue-list", [...defaultMiddleware, teamRolesOrganizationMiddleware, tenantMiddleware], VenueCtrl.getVenueNameIdAndStatus);
// router.get("/venue-details", [...defaultMiddleware, tenantMiddleware], VenueCtrl.getVenueDetails);
// router.get("/count", [...defaultMiddleware, tenantMiddleware], VenueCtrl.countVenue);
// router.patch("/:venue_id", [...defaultMiddleware, ...teamOrganizationMiddleware], VenueCtrl.updateVenue);
// router.delete("/", [...defaultMiddleware, ...teamOrganizationMiddleware], VenueCtrl.deleteMultipleVenues);
// router.delete("/:id", [...defaultMiddleware, tenantMiddleware, ...teamOrganizationMiddleware], VenueCtrl.deleteVenue);

// router.post("/transfer-ownership/accept/:token", tenantMiddleware, VenueCtrl.transferOwnershipAccept);
// router.post("/transfer-ownership/accept/existing/:token", tenantMiddleware, VenueCtrl.transferOwnershipAcceptExisting);

export default router;
