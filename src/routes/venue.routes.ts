import express from "express";
import VenueCtrl from "../controllers/venue.controller";
import {
  authenticate,
  requireRole,
  requireAdmin,
} from "../middleware/auth.middleware";

const router = express.Router();

// Public routes
router.get("/", VenueCtrl.getVenues);
router.get("/catalog", VenueCtrl.getCatalog);
router.get("/:id", VenueCtrl.getVenueById);

// Protected routes
router.post(
  "/create",
  authenticate,
  requireRole(["venueFoxer"]),
  VenueCtrl.createVenue,
);
router.put(
  "/:id",
  authenticate,
  requireRole(["venueFoxer"]),
  VenueCtrl.updateVenue,
);
router.delete(
  "/:id",
  authenticate,
  requireRole(["venueFoxer"]),
  VenueCtrl.deleteVenue,
);

// Admin routes
router.patch(
  "/:id/approve",
  authenticate,
  requireAdmin,
  VenueCtrl.approveVenue,
);
router.patch("/:id/reject", authenticate, requireAdmin, VenueCtrl.rejectVenue);

export default router;
