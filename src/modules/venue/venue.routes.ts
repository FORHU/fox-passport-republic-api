import express from "express";
import VenueCtrl from "./venue.controller";
import {
  authenticate,
  requirePermission,
} from "../../middleware/auth.middleware";

const router = express.Router();

// Public routes
router.get("/", VenueCtrl.getVenues);
router.get("/catalog", VenueCtrl.getCatalog);
router.get("/near", VenueCtrl.getVenuesNear);
router.get("/boundaries", VenueCtrl.getBoundaries);
router.get("/:id", VenueCtrl.getVenueById);

// Protected routes
router.post(
  "/create",
  authenticate,
  requirePermission("venue:manage"),
  VenueCtrl.createVenue,
);
router.put(
  "/:id",
  authenticate,
  requirePermission("venue:manage"),
  VenueCtrl.updateVenue,
);
router.delete(
  "/:id",
  authenticate,
  requirePermission("venue:manage"),
  VenueCtrl.deleteVenue,
);

// Approve/reject moved to admin.routes.ts (AdminCtrl) — this pair had
// diverged from it (no XP/badge award, no socket announce) and this app only
// ever called the admin path. See docs/TOMORROW.md.

export default router;
