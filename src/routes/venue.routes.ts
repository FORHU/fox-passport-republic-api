import express from "express";
import VenueCtrl from "../controllers/venue.controller";
import { authenticate } from "../middleware/auth.middleware";
import { upload } from "../middleware/fileUpload";

const router = express.Router();

// Public routes
router.get("/", VenueCtrl.getVenues);
router.get("/:id", VenueCtrl.getVenueById);

// Protected routes — require JWT
router.post("/", authenticate, VenueCtrl.createVenue);
router.post("/create", authenticate, VenueCtrl.createVenue); // Support legacy slash-less
router.put("/:id", authenticate, VenueCtrl.updateVenue);
router.delete("/:id", authenticate, VenueCtrl.deleteVenue);

// Image management handlers (Consolidated in VenueCtrl)
router.post("/:id/images", authenticate, upload.array("images", 10), VenueCtrl.uploadVenueImages);
router.put("/images/:imageId", authenticate, VenueCtrl.updateVenueImage);
router.delete("/images/:imageId", authenticate, VenueCtrl.deleteVenueImage);

export default router;