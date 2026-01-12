import express from "express";
import FoxerCtrl from "../controllers/foxer.controller";

const router = express.Router();

// Categories
router.post("/categories", FoxerCtrl.createCategory);
router.get("/categories", FoxerCtrl.getAllCategories);

// Profiles
router.post("/profile", FoxerCtrl.upsertProfile);

// Listing Services
router.post("/services", FoxerCtrl.createService);
router.get("/listing/:listingId/services", FoxerCtrl.getListingServices);

export default router;
