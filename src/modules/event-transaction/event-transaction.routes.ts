import express from "express";
import EventTransactionCtrl from "./event-transaction.controller";
import { authenticate } from "../../middleware/auth.middleware";

const router = express.Router();

router.get("/provider", authenticate, EventTransactionCtrl.listProviderItems);
router.post("/", authenticate, EventTransactionCtrl.createTransactions);
router.patch("/:id/review", authenticate, EventTransactionCtrl.reviewItem);

export default router;
