import express from "express";
import { getAllCountries, getCitiesByCountry, searchLocations } from "../controllers/location.controller";
import { searchRateLimiter } from "../middleware/rateLimiter";

const router = express.Router();

router.get("/search", searchRateLimiter, searchLocations);
router.get("/countries", getAllCountries);
router.get("/cities/:countryCode", getCitiesByCountry);

export default router;
