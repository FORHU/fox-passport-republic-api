import express from "express";
import VenueCtrl from "../controllers/venue.controller";
import { authenticate, requirePermission } from "../middleware/auth.middleware";

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

// Admin routes
router.patch(
  "/:id/approve",
  authenticate,
  requirePermission("queue:decide"),
  VenueCtrl.approveVenue,
);
router.patch(
  "/:id/reject",
  authenticate,
  requirePermission("queue:decide"),
  VenueCtrl.rejectVenue,
);

export default router;
