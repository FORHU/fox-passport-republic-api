import express from "express";
import EventTransactionCtrl from "../controllers/event-transaction.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = express.Router();

router.get("/provider", authenticate, EventTransactionCtrl.listProviderItems);
router.patch("/:id/review", authenticate, EventTransactionCtrl.reviewItem);

export default router;
