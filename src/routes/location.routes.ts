import express from "express";
import { getAllCountries, getCitiesByCountry, searchLocations } from "../controllers/location.controller";

const router = express.Router();

router.get("/search", searchLocations);
router.get("/countries", getAllCountries);
router.get("/cities/:countryCode", getCitiesByCountry);

export default router;
