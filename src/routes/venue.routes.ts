import express from "express";
import VenueCtrl from "../controllers/venue.controller";
import { authenticate } from "../middlewares/auth.middleware";

const router = express.Router();

// Public
router.get("/", VenueCtrl.getAllVenues);
router.get("/:id", VenueCtrl.getVenueById);

// Protected
router.use(authenticate);
router.post("/", VenueCtrl.createVenue);
router.put("/:id", VenueCtrl.updateVenue);
router.delete("/:id", VenueCtrl.deleteVenue);

export default router;
