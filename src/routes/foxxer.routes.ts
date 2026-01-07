import express from "express";
import FoxxerCtrl from "../controllers/foxxer.controller";

const router = express.Router();

// Categories
router.post("/categories", FoxxerCtrl.createCategory);
router.get("/categories", FoxxerCtrl.getAllCategories);

// Profiles
router.post("/profile", FoxxerCtrl.upsertProfile);

// Listing Services
router.post("/services", FoxxerCtrl.createService);
router.get("/listing/:listingId/services", FoxxerCtrl.getListingServices);

export default router;
