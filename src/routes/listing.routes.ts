import express from "express";
import ListingCtrl from "../controllers/listing.controller";

const router = express.Router();

// Listing CRUD routes
router.get("/", ListingCtrl.getAllListings);
router.get("/:id", ListingCtrl.getListingById);
router.post("/create", ListingCtrl.createListing);
router.post("/create-complete", ListingCtrl.createCompleteListing);
router.put("/:id", ListingCtrl.updateListing);
router.delete("/:id", ListingCtrl.deleteListing);

// Listing location routes
router.put("/:id/location", ListingCtrl.updateListingLocation);

// Listing image routes
router.post("/:id/images", ListingCtrl.addListingImage);

export default router;