import express from "express";
import VenueCtrl from "./venue.controller";
import appointmentTeamRoutes from "../appointment/appointment-team.routes";
import {
  authenticate,
  optionalAuth,
  requirePermission,
} from "../../middleware/auth.middleware";

const router = express.Router();

router.use("/:venueId/appointments", appointmentTeamRoutes);

// Public routes
router.get("/", VenueCtrl.getVenues);
router.get("/catalog", VenueCtrl.getCatalog);
router.get("/near", VenueCtrl.getVenuesNear);
router.get("/boundaries", VenueCtrl.getBoundaries);
router.get("/:id/unavailable-dates", VenueCtrl.getUnavailableDates);
// optionalAuth: without it `req.user` was never set here, so the Mayor's
// preview of their own unpublished venue (VenueSvc.getVenueById) never worked.
router.get("/:id", optionalAuth, VenueCtrl.getVenueById);

// Protected routes
router.post(
  "/create",
  authenticate,
  requirePermission("venue:manage"),
  VenueCtrl.createVenue,
);
// Checked in VenueSvc: the Mayor (or an admin) edits anything; an Organizer
// with `venue:edit-listing` edits only descriptive fields. Organizers hold no
// global `venue:manage`. On validate-rbac-guards' allow-list.
router.put("/:id", authenticate, VenueCtrl.updateVenue);
router.delete(
  "/:id",
  authenticate,
  requirePermission("venue:manage"),
  VenueCtrl.deleteVenue,
);

// Calendar — mayor or an approved affiliate with `calendar:block`; exact
// identity is checked in VenueSvc, this only requires *a* supply-side role.
// Checked per Venue in VenueSvc.assertCanBlockCalendar: the Mayor, its
// Organizers (`venue:calendar`), or an affiliated Event Foxer
// (`calendar:block`). On validate-rbac-guards' allow-list.
router.post("/:id/blocked-dates", authenticate, VenueCtrl.blockDate);
router.delete("/:id/blocked-dates/:date", authenticate, VenueCtrl.unblockDate);

// Approve/reject moved to admin.routes.ts (AdminCtrl) — this pair had
// diverged from it (no XP/badge award, no socket announce) and this app only
// ever called the admin path. See docs/NEXT.md.

export default router;
