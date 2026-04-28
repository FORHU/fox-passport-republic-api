import express from "express";
import VenueCtrl from "../controllers/venue.controller";
import { authenticate, requireRole } from "../middleware/auth.middleware";

const router = express.Router();

// Public routes
router.get("/", VenueCtrl.getVenues);
router.get("/:id", VenueCtrl.getVenueById);

// Protected routes
router.post("/create", authenticate, requireRole(["mayor"]), VenueCtrl.createVenue);
router.put("/:id", authenticate, requireRole(["mayor"]), VenueCtrl.updateVenue);
router.delete("/:id", authenticate, requireRole(["mayor"]), VenueCtrl.deleteVenue);



export default router;