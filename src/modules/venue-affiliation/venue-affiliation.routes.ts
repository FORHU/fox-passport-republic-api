import express from "express";
import VenueAffiliationCtrl from "./venue-affiliation.controller";
import {
  authenticate,
  requirePermission,
  requirePermissionAny,
} from "../../middleware/auth.middleware";

const router = express.Router();

// GET /v1/venue-affiliations/mine — both directions for the current user
router.get("/mine", authenticate, VenueAffiliationCtrl.getMine);

// GET /v1/venue-affiliations/venue/:venueId — a mayor's view of their venue's affiliates
router.get("/venue/:venueId", authenticate, VenueAffiliationCtrl.getForVenue);

// POST /v1/venue-affiliations/apply — Event Foxer applies to a venue
router.post(
  "/apply",
  authenticate,
  requirePermissionAny(["template:manage"]),
  VenueAffiliationCtrl.apply,
);

// POST /v1/venue-affiliations/invite — venue mayor invites/employs an Event Foxer
router.post(
  "/invite",
  authenticate,
  requirePermissionAny(["venue:manage"]),
  VenueAffiliationCtrl.invite,
);

// The other party to the affiliation decides — could be either role, so the
// route only checks the caller holds *a* supply-side capability; exact
// identity (venue mayor vs. the specific invited Event Foxer) is enforced in
// VenueAffiliationSvc.
// Listing, approving and rejecting are checked per Venue in
// VenueAffiliationSvc: the mayor or its Organizers (`venue:approve-affiliations`)
// on the venue's side, the invited Event Foxer on theirs. On
// validate-rbac-guards' allow-list.
router.patch("/:id/approve", authenticate, VenueAffiliationCtrl.approve);
router.patch("/:id/reject", authenticate, VenueAffiliationCtrl.reject);

// PATCH /v1/venue-affiliations/:id/cancel — withdraws a still-pending
// affiliation; either party (applicant or inviter) may do this, so the
// route only checks the caller holds *a* supply-side capability, same as
// approve/reject above — VenueAffiliationSvc.cancel checks exact identity
// and that the row is actually still pending.
router.patch(
  "/:id/cancel",
  authenticate,
  requirePermissionAny(["venue:manage", "template:manage"]),
  VenueAffiliationCtrl.cancel,
);

// DELETE /v1/venue-affiliations/:id — revokes an APPROVED affiliation.
// Venue-owner-only (not the affiliated Event Foxer), so this is gated
// tighter than cancel/approve/reject: venue:manage is required at the route,
// and VenueAffiliationSvc.revoke additionally checks the caller is this
// specific venue's mayor.
router.delete(
  "/:id",
  authenticate,
  requirePermission("venue:manage"),
  VenueAffiliationCtrl.revoke,
);

export default router;
