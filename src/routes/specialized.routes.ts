import { Router } from "express";
import SpecializedListingController from "../controllers/specializedListing.controller";

const router = Router();

// Specialized Listing Types Routes
router.get("/venues", SpecializedListingController.getVenues);
router.get("/chairs", SpecializedListingController.getEquipment);
router.get("/foods", SpecializedListingController.getCatering);
router.get("/events", SpecializedListingController.getEvents);

export default router;
