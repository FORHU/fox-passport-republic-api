import { Router } from "express";
import VenueController from "../controllers/venue.controller";
import { authenticate, requireHost } from "../middleware/auth.middleware";

const router = Router();

// Venue CRUD routes
router.post("/", authenticate, requireHost, VenueController.createVenue);
router.get("/", VenueController.getAllVenues);
// IMPORTANT: Specific routes must come before parameterized routes
router.get("/category/:categorySlug", VenueController.getVenuesByCategory);
router.get("/:id", VenueController.getVenueById);
router.put("/:id", authenticate, requireHost, VenueController.updateVenue);
router.delete("/:id", authenticate, requireHost, VenueController.deleteVenue);

// Amenity routes
router.post(
  "/:venueId/amenities",
  authenticate,
  requireHost,
  VenueController.addAmenity
);
router.delete(
  "/amenities/:amenityId",
  authenticate,
  requireHost,
  VenueController.removeAmenity
);

// Image routes
router.post(
  "/:venueId/images",
  authenticate,
  requireHost,
  VenueController.addImage
);
router.delete(
  "/images/:imageId",
  authenticate,
  requireHost,
  VenueController.removeImage
);

// Review routes
router.post("/:venueId/reviews", authenticate, VenueController.addReview); // Any authenticated user can review? Or just guests? Assuming auth for now.
router.get("/:venueId/reviews", VenueController.getVenueReviews);

export default router;
