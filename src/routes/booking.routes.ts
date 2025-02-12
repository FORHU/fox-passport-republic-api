import express from "express";

import authenticateToken from "../middleware/authenticate-token.middleware";
import optionalAuthMiddleware from "../middleware/optional-auth.middleware";
import teamRolesOrganizationMiddleware from "../middleware/team-organization.middleware";
import teamRolesOrganizationPermissionMiddleware from "../middleware/team-organization-permission.middleware";
import sessionMiddleware from "../middleware/valid-session.middleware";

const teamOrganizationMiddleware = [teamRolesOrganizationMiddleware, teamRolesOrganizationPermissionMiddleware];

const router = express.Router();

import BookingCtrl from "../controllers/booking.controller";
import tenantMiddleware from "../middleware/tenant.middleware";

router.get("/", [optionalAuthMiddleware, teamRolesOrganizationMiddleware], BookingCtrl.getBooking);
router.post("/", [sessionMiddleware, authenticateToken, ...teamOrganizationMiddleware], BookingCtrl.createBooking);
router.patch(
  "/update-days",
  [sessionMiddleware, authenticateToken, tenantMiddleware, ...teamOrganizationMiddleware],
  BookingCtrl.updateMultipleBookings,
);
router.patch("/:booking_id", [sessionMiddleware, authenticateToken, tenantMiddleware, ...teamOrganizationMiddleware], BookingCtrl.updateBooking);
router.delete("/:booking_id", [sessionMiddleware, authenticateToken, tenantMiddleware, ...teamOrganizationMiddleware], BookingCtrl.deleteBooking);
router.get("/cancel/computation/:booking_id", [sessionMiddleware, authenticateToken, tenantMiddleware], BookingCtrl.refundComputation);
router.get("/existing-booking", [sessionMiddleware, authenticateToken, tenantMiddleware], BookingCtrl.existingBooking);
router.patch(
  "/cancel/:booking_id",
  [sessionMiddleware, authenticateToken, tenantMiddleware, ...teamOrganizationMiddleware],
  BookingCtrl.cancelBooking,
);

export default router;
