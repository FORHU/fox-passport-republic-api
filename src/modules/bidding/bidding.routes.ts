import express from "express";
import BiddingCtrl from "./bidding.controller";
import { authenticate, requireRole } from "../../middleware/auth.middleware";

const router = express.Router();

// GET /v1/bids/open-slots
router.get("/open-slots", BiddingCtrl.getOpenSlots);

// --- SERVICE BIDS ---
// GET /v1/bids/service/event/:eventId (Host seeing their own event's service bids)
router.get("/service/event/:eventId", authenticate, requireRole(["eventFoxer"]), BiddingCtrl.getServiceBidsForEvent);

// POST /v1/bids/service (Talent Foxer submits a bid)
router.post("/service", authenticate, requireRole(["serviceFoxer"]), BiddingCtrl.submitServiceBid);

// PATCH /v1/bids/service/:id/accept (Host accepts a service bid)
router.patch("/service/:id/accept", authenticate, requireRole(["eventFoxer"]), BiddingCtrl.acceptServiceBid);

// PATCH /v1/bids/service/:id/reject (Host manually rejects a service bid)
router.patch("/service/:id/reject", authenticate, requireRole(["eventFoxer"]), BiddingCtrl.rejectServiceBid);


// --- ASSET BIDS ---
// GET /v1/bids/asset/event/:eventId (Host seeing their own event's asset bids)
router.get("/asset/event/:eventId", authenticate, requireRole(["eventFoxer"]), BiddingCtrl.getAssetBidsForEvent);

// POST /v1/bids/asset (Gear Foxer submits a bid)
router.post("/asset", authenticate, requireRole(["gearFoxer"]), BiddingCtrl.submitAssetBid);

// PATCH /v1/bids/asset/:id/accept (Host accepts an asset bid)
router.patch("/asset/:id/accept", authenticate, requireRole(["eventFoxer"]), BiddingCtrl.acceptAssetBid);

// PATCH /v1/bids/asset/:id/reject (Host manually rejects an asset bid)
router.patch("/asset/:id/reject", authenticate, requireRole(["eventFoxer"]), BiddingCtrl.rejectAssetBid);

export default router;
