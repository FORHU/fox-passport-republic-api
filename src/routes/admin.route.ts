import express from "express";

import AdminCtrl from "../controllers/admin.controller";
import AdminMemberCtrl from "../controllers/admin-members.contoller";
import authenticateToken from "../middleware/authenticate-token.middleware";
import rolesMiddleware from "../middleware/roles.middleware";
import tenantMiddleware from "../middleware/tenant.middleware";
import tenantValidationMiddleware from "../middleware/tenant-validation.middleware";
import sessionMiddleware from "../middleware/valid-session.middleware";

const ADMIN_MIDDLEWARE = [sessionMiddleware, authenticateToken, rolesMiddleware];

const TENANT_MIDDLEWARE = [tenantMiddleware, tenantValidationMiddleware];

const router = express.Router();

// spaces routes
router.get("/space", [...ADMIN_MIDDLEWARE, ...TENANT_MIDDLEWARE], AdminCtrl.getAllSpaces);
router.get("/space/count", [...ADMIN_MIDDLEWARE, ...TENANT_MIDDLEWARE], AdminCtrl.countAdminSpace);
router.patch("/space/:space_id", [...ADMIN_MIDDLEWARE, tenantMiddleware], AdminCtrl.updateSpace);
router.delete("/space/:space_id", [...ADMIN_MIDDLEWARE], AdminCtrl.deleteSpace);

// venue routes
router.get("/venue", [...ADMIN_MIDDLEWARE, ...TENANT_MIDDLEWARE], AdminCtrl.getAllVenues);
router.get("/venue/count", [...ADMIN_MIDDLEWARE, ...TENANT_MIDDLEWARE], AdminCtrl.countAdminVenue);
router.patch("/venue/:venue_id", [...ADMIN_MIDDLEWARE, tenantMiddleware], AdminCtrl.updateVenue);
router.delete("/venue/:venue_id", [...ADMIN_MIDDLEWARE, tenantMiddleware], AdminCtrl.deleteVenue);

//enquiries routes
router.get("/enquiries", [...ADMIN_MIDDLEWARE, ...TENANT_MIDDLEWARE], AdminCtrl.getEnquries);

//admin patch organization member
router.patch("/organization-member", [...ADMIN_MIDDLEWARE], AdminCtrl.updateOrganizationMember);

//admin patch keywords
router.patch("/keywords", [...ADMIN_MIDDLEWARE], AdminCtrl.updateKeywords);

//products and subscription
router.post("/product", [...ADMIN_MIDDLEWARE], AdminCtrl.createProduct);

//migrate files from s3 bucket to digital ocean space
router.patch("/migrate-files", [...ADMIN_MIDDLEWARE], AdminCtrl.migrateFiles);
router.patch("/migrate-tenant", [...ADMIN_MIDDLEWARE, ...TENANT_MIDDLEWARE], AdminCtrl.tenantMigration);

// remove unused questions
router.delete("/delete-questions", [...ADMIN_MIDDLEWARE], AdminCtrl.deleteUnusedQuestions);

//ADMIN TEAM MEMBER MANAGEMENT
router.get("/members", [...ADMIN_MIDDLEWARE, ...TENANT_MIDDLEWARE], AdminMemberCtrl.getAdminMembers);
router.post("/invitation", [...ADMIN_MIDDLEWARE, ...TENANT_MIDDLEWARE], AdminMemberCtrl.inviteAdminMember);
router.post("/accept/:token", AdminMemberCtrl.acceptInvitationAdminMember);
router.patch("/member/:id", [...ADMIN_MIDDLEWARE], AdminMemberCtrl.updateAdminMemberbyId);
router.delete("/member/:id", [...ADMIN_MIDDLEWARE], AdminMemberCtrl.deleteAdminMemberbyId);

//ADMIN VENUE TRANSFER OWNERSHIP
router.post("/venue/transfer-ownership/invite/:venueId", [...ADMIN_MIDDLEWARE, tenantMiddleware], AdminCtrl.transferOwnershipRequest);
router.post("/venue/transfer-ownership/invite/resend/:venueId", [...ADMIN_MIDDLEWARE, tenantMiddleware], AdminCtrl.transferOwnershipResend);

//ADMIN SALES
router.get("/sales", [...ADMIN_MIDDLEWARE, ...TENANT_MIDDLEWARE], AdminMemberCtrl.getSalesTransaction);

//upload exel files

router.post("/upload-excel", [...ADMIN_MIDDLEWARE], AdminCtrl.uploadExcelFile);

//migrate user roles

router.post("/migrate-user-roles", AdminCtrl.migrateUserRoles);

//rating
router.get("/ratings", [...ADMIN_MIDDLEWARE, tenantMiddleware], AdminCtrl.getRatings);
router.patch("/rating/:rating_id", [...ADMIN_MIDDLEWARE], AdminCtrl.updateRating);

export default router;
