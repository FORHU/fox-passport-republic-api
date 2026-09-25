import express from "express";
import BiddingCtrl from "./bidding.controller";
import {
  authenticate,
  requirePermission,
} from "../../middleware/auth.middleware";

const router = express.Router();

// GET /v1/bids/open-slots
router.get("/open-slots", BiddingCtrl.getOpenSlots);

// Seeing and rejecting bids is checked per Event in BiddingSvc (the Owner or
// their Organizers, via AppointmentAccess) — Organizers hold no global
// `bid:manage`. Accepting keeps `bid:manage`: it sets the agreed price and
// stays the Owner's alone.
// --- SERVICE BIDS ---
// GET /v1/bids/service/event/:eventId (Host seeing their own event's service bids)
router.get(
  "/service/event/:eventId",
  authenticate,
  BiddingCtrl.getServiceBidsForEvent,
);

// POST /v1/bids/service (Talent Foxer submits a bid)
router.post(
  "/service",
  authenticate,
  requirePermission("bid:submit-service"),
  BiddingCtrl.submitServiceBid,
);

// PATCH /v1/bids/service/:id/accept (Host accepts a service bid)
router.patch(
  "/service/:id/accept",
  authenticate,
  requirePermission("bid:manage"),
  BiddingCtrl.acceptServiceBid,
);

// PATCH /v1/bids/service/:id/reject (Host manually rejects a service bid)
router.patch("/service/:id/reject", authenticate, BiddingCtrl.rejectServiceBid);

// --- ASSET BIDS ---
// GET /v1/bids/asset/event/:eventId (Host seeing their own event's asset bids)
router.get(
  "/asset/event/:eventId",
  authenticate,
  BiddingCtrl.getAssetBidsForEvent,
);

// POST /v1/bids/asset (Gear Foxer submits a bid)
router.post(
  "/asset",
  authenticate,
  requirePermission("bid:submit-asset"),
  BiddingCtrl.submitAssetBid,
);

// PATCH /v1/bids/asset/:id/accept (Host accepts an asset bid)
router.patch(
  "/asset/:id/accept",
  authenticate,
  requirePermission("bid:manage"),
  BiddingCtrl.acceptAssetBid,
);

// PATCH /v1/bids/asset/:id/reject (Host manually rejects an asset bid)
router.patch("/asset/:id/reject", authenticate, BiddingCtrl.rejectAssetBid);

export default router;
