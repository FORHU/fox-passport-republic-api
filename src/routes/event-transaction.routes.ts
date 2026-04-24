import express from "express";
import EventTransactionCtrl from "../controllers/event-transaction.controller";
import { authenticate, requireRole } from "../middleware/auth.middleware";

const router = express.Router();

// Host creation endpoints
router.post("/assets", authenticate, requireRole(["host"]), EventTransactionCtrl.createAssetTransaction);
router.post("/services", authenticate, requireRole(["host"]), EventTransactionCtrl.createServiceTransaction);
router.post("/venues", authenticate, requireRole(["host"]), EventTransactionCtrl.createVenueTransaction);

// Review/Price Update endpoints (Role specific logic is inside the service/controller)
router.patch("/:type/:id/review", authenticate, EventTransactionCtrl.reviewTransaction);

// Fetching
router.get("/event/:eventId", authenticate, EventTransactionCtrl.getEventTransactions);

export default router;