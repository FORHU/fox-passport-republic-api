import express from "express";
import InvestmentCtrl from "./investment.controller";
import { authenticate } from "../../middleware/auth.middleware";

const router = express.Router();

// Specific routes before /:id
router.get("/map", InvestmentCtrl.getInvestmentsOnMap);
router.get(
  "/nearby-for-venue/:venueId",
  InvestmentCtrl.getNearbyInventoryForVenue,
);

// General collection
router.get("/", InvestmentCtrl.getInvestments);
router.post("/", authenticate, InvestmentCtrl.createInvestment);

// Specific investment detail
router.get("/:id", InvestmentCtrl.getInvestmentById);

export default router;
