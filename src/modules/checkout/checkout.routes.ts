import express from "express";
import CheckoutCtrl from "./checkout.controller";
import { authenticate } from "../../middleware/auth.middleware";

/**
 * Mounted at bare `/v1` (see `routes/index.ts`) rather than nested under
 * `event.routes.ts`/`partnership.routes.ts`, so this module stays
 * self-contained while still exposing the four endpoint paths the app
 * repo's Central Payment frontend plan is already built against exactly:
 * `POST /v1/events/:eventId/checkout`, `GET /v1/events/:eventId/payment-summary`,
 * `POST /v1/partnerships/:proposalId/checkout`, `GET /v1/invoices/:id`.
 * None of these literal path segments ("checkout", "payment-summary")
 * collide with anything `event.routes.ts` or `partnership.routes.ts`
 * already registers, so mount order relative to them doesn't matter.
 */
const router = express.Router();

router.post(
  "/events/:eventId/checkout",
  authenticate,
  CheckoutCtrl.createEventCheckout,
);
router.get(
  "/events/:eventId/payment-summary",
  authenticate,
  CheckoutCtrl.getEventPaymentSummary,
);
router.post(
  "/partnerships/:proposalId/checkout",
  authenticate,
  CheckoutCtrl.createSponsorshipCheckout,
);
router.get("/invoices/:id", authenticate, CheckoutCtrl.getInvoiceStatus);

export default router;
