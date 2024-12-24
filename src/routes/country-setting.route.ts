import express from "express";

import authenticateToken from "../middleware/authenticate-token.middleware";
import sessionMiddleware from "../middleware/valid-session.middleware";
const router = express.Router();

import CountrySettingCtrl from "../controllers/country-setting.controller";

router.get("/", CountrySettingCtrl.getCountrySetting);
router.get("/list", CountrySettingCtrl.getListCountrySetting);
router.get("/:id", [sessionMiddleware, authenticateToken], CountrySettingCtrl.getCountrySettingById);
router.post("/", [sessionMiddleware, authenticateToken], CountrySettingCtrl.createCountry);
router.patch("/:id", [sessionMiddleware, authenticateToken], CountrySettingCtrl.updateCountrySetting);
router.delete("/:id", [sessionMiddleware, authenticateToken], CountrySettingCtrl.deleteCountrySetting);

export default router;
