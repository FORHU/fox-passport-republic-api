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
router.get("/event/:eventId", authenticate, EventTransactionCtrl.bookedEvent);
// Moving a booked event to another date (ADR 0010 decision 6).
router.get(
  "/event/:eventId/reschedule-preview",
  authenticate,
  EventTransactionCtrl.reschedulePreview,
);
router.post(
  "/event/:eventId/reschedule",
  authenticate,
  EventTransactionCtrl.proposeReschedule,
);
// Replacing a Supplier on a booked event (ADR 0010).
router.get("/proposals", authenticate, EventTransactionCtrl.proposals);
router.get(
  "/booking/:bookingId/replacement",
  authenticate,
  EventTransactionCtrl.bookingReplacement,
);
router.post(
  "/proposals/:id/accept",
  authenticate,
  EventTransactionCtrl.answerProposal("accept"),
);
router.post(
  "/proposals/:id/decline",
  authenticate,
  EventTransactionCtrl.answerProposal("decline"),
);
router.post(
  "/proposals/:id/confirm-payment",
  authenticate,
  EventTransactionCtrl.answerProposal("confirm-payment"),
);
router.post(
  "/proposals/:id/withdraw",
  authenticate,
  EventTransactionCtrl.answerProposal("withdraw"),
);
router.get(
  "/:id/replacements",
  authenticate,
  EventTransactionCtrl.replacements,
);
router.post(
  "/:id/replace",
  authenticate,
  EventTransactionCtrl.proposeReplacement,
);
router.post("/", authenticate, EventTransactionCtrl.createTransactions);
router.patch("/:id/review", authenticate, EventTransactionCtrl.reviewItem);

export default router;
