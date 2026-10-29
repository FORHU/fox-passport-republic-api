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
router.patch("/:id", authenticate, InvestmentCtrl.updateInvestment);
router.delete("/:id", authenticate, InvestmentCtrl.deleteInvestment);
router.patch("/:id/cancel", authenticate, InvestmentCtrl.cancelInvestment);
router.patch("/:id/archive", authenticate, InvestmentCtrl.archiveInvestment);

export default router;
