import { Router } from "express";
import VenueController from "../controllers/venue.controller";

const router = Router();

// Venue CRUD routes
router.post("/", VenueController.createVenue);
router.get("/", VenueController.getAllVenues);
router.get("/:id", VenueController.getVenueById);
router.get("/category/:categorySlug", VenueController.getVenuesByCategory);
router.put("/:id", VenueController.updateVenue);
router.delete("/:id", VenueController.deleteVenue);

// Amenity routes
router.post("/:venueId/amenities", VenueController.addAmenity);
router.delete("/amenities/:amenityId", VenueController.removeAmenity);

// Image routes
router.post("/:venueId/images", VenueController.addImage);
router.delete("/images/:imageId", VenueController.removeImage);

// Review routes
router.post("/:venueId/reviews", VenueController.addReview);
router.get("/:venueId/reviews", VenueController.getVenueReviews);

export default router;
