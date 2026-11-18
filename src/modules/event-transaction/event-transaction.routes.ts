import express from "express";
import EventTransactionCtrl from "./event-transaction.controller";
import { authenticate } from "../../middleware/auth.middleware";

const router = express.Router();

router.get("/provider", authenticate, EventTransactionCtrl.listProviderItems);
router.get(
  "/needs-attention",
  authenticate,
  EventTransactionCtrl.needsAttention,
);
router.post("/", authenticate, EventTransactionCtrl.createTransactions);
router.patch("/:id/review", authenticate, EventTransactionCtrl.reviewItem);

export default router;
