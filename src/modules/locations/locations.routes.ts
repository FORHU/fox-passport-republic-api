import express from "express";
import LocationsCtrl from "./locations.controller";

const router = express.Router();

// Public city autocomplete for the hero search box — no auth required
router.get("/search", LocationsCtrl.searchLocations);

export default router;
