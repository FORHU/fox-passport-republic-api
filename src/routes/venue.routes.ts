import express from "express";
import VenueCtrl from "../controllers/venue.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = express.Router();

// Public routes
router.get("/", VenueCtrl.getVenues);
router.get("/:id", VenueCtrl.getVenueById);

// Protected routes — require JWT
router.post("/create", authenticate, VenueCtrl.createVenue);
router.put("/:id", authenticate, VenueCtrl.updateVenue);
router.delete("/:id", authenticate, VenueCtrl.deleteVenue);



export default router;