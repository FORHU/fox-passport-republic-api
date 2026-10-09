import express from "express";
import LocationsCtrl from "./locations.controller";

const router = express.Router();

// Public city autocomplete for the hero search box — no auth required
router.get("/search", LocationsCtrl.searchLocations);

// Public reference data for the cascading country → state → city pickers.
router.get("/countries", LocationsCtrl.countries);
router.get("/countries/:countryCode/states", LocationsCtrl.states);
router.get("/countries/:countryCode/cities", LocationsCtrl.cities);
router.get("/nearest", LocationsCtrl.nearest);

export default router;
