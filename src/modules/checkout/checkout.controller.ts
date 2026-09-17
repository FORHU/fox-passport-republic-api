import { Request, Response } from "express";
import Joi from "joi";
import EventCheckoutSvc, {
  BlockingItemsError,
} from "../payment/event-checkout.service";
import PartnershipCheckoutSvc from "../payment/partnership-checkout.service";
import InvoiceSvc from "../payment/invoice.service";
import { can } from "../../types/permissions";
import { AvailabilityConflictError } from "../availability/availability.types";

/**
 * The HTTP layer for Central Payment's checkout flow. Deliberately thin —
 * every response shape and business rule here already exists in
 * `EventCheckoutSvc`, `PartnershipCheckoutSvc` and `InvoiceSvc`; this file's
 * only job is Joi validation, calling the right service method, and mapping
 * its result/errors onto the locked response contracts. See
 * `docs/CENTRAL-PAYMENT-FRONTEND-PLAN.md` (app repo) for why these four
 * response shapes are flat JSON rather than this codebase's usual
 * `{ success, data }` envelope — the frontend is already built against them
 * exactly as documented there.
 */
function statusForCheckoutError(message: string): number {
  if (message.includes("not found")) return 404;
  if (message.startsWith("Unauthorized")) return 403;
  if (message.includes("already been paid")) return 409;
  if (message.includes("already cancelled")) return 409;
  if (message.includes("already been refunded")) return 409;
  return 400;
}

/**
 * Phase B added two error types the frontend needs structured data from, not
 * just a message string: which items are blocking checkout
 * (BlockingItemsError), and which specific item lost availability
 * (AvailabilityConflictError). Both are real, distinct conditions the
 * checkout screen must render specifically ("these items need your
 * attention" / "this item is no longer available") — falling through to the
 * generic { success: false, message } shape below would lose the ids/kind
 * the frontend needs to do that, even though the HTTP status would still be
 * technically correct.
 */
function checkoutErrorResponse(err: Error): {
  status: number;
  body: Record<string, unknown>;
} {
  if (err instanceof BlockingItemsError) {
    return {
      status: 409,
      body: {
        success: false,
        message: err.message,
        code: "ITEMS_AWAITING_CONFIRMATION",
        blockingItemIds: err.blockingItemIds,
      },
    };
  }
  if (err instanceof AvailabilityConflictError) {
    return {
      status: 409,
      body: {
        success: false,
        message: err.message,
        code: "AVAILABILITY_CONFLICT",
        kind: err.kind,
        itemId: err.itemId,
      },
    };
  }
  return {
    status: statusForCheckoutError(err.message),
    body: { success: false, message: err.message },
  };
}

// Any number of codes — a multi-provider Event checkout lets a citizen
// redeem every voucher they're eligible for (one per matching line item)
// rather than being capped at a single code. See
// PricingSvc.resolveEventLineItemDiscounts for how they're matched.
const voucherSchema = Joi.object({
  voucherCodes: Joi.array().items(Joi.string().trim()).optional(),
});

// Sponsorships are single-provider — no per-item scoping to resolve, so
// this keeps the original single-code shape rather than the array above.
const sponsorshipVoucherSchema = Joi.object({
  voucherCode: Joi.string().trim().optional(),
});

export default class CheckoutController {
  // POST /v1/events/:eventId/checkout
  static async createEventCheckout(req: Request, res: Response) {
    const { error, value } = voucherSchema.validate(req.body ?? {});
    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    try {
      const result = await EventCheckoutSvc.createEventCheckout(
        req.params.eventId,
        req.user!.userId,
        value.voucherCodes ?? [],
      );
      return res.status(201).json({
        invoiceId: result.invoice.id,
        checkoutId: result.checkoutId,
        url: result.url,
        status: result.status,
      });
    } catch (e: unknown) {
      const { status, body } = checkoutErrorResponse(e as Error);
      return res.status(status).json(body);
    }
  }

  // GET /v1/events/:eventId/payment-summary
  static async getEventPaymentSummary(req: Request, res: Response) {
    const schema = Joi.object({
      // `.single(true)`: a query string with exactly one `voucherCodes=`
      // parses as a bare string, not a 1-element array — this coerces it
      // into one either way, so the caller can always send `voucherCodes`
      // as either shape.
      voucherCodes: Joi.array()
        .items(Joi.string().trim())
        .single(true)
        .optional(),
    });
    const { error, value } = schema.validate(req.query);
    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    try {
      const summary = await EventCheckoutSvc.getPaymentSummary(
        req.params.eventId,
        req.user!.userId,
        value.voucherCodes ?? [],
      );
      return res.status(200).json(summary);
    } catch (e: unknown) {
      const { status, body } = checkoutErrorResponse(e as Error);
      return res.status(status).json(body);
    }
  }

  // POST /v1/events/:eventId/cancel
  static async cancelEvent(req: Request, res: Response) {
    try {
      const result = await EventCheckoutSvc.cancelEvent(
        req.params.eventId,
        req.user!.userId,
      );
      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (e: unknown) {
      const err = e as Error;
      return res
        .status(statusForCheckoutError(err.message))
        .json({ success: false, message: err.message });
    }
  }

  // POST /v1/partnerships/:proposalId/checkout
  static async createSponsorshipCheckout(req: Request, res: Response) {
    const { error, value } = sponsorshipVoucherSchema.validate(req.body ?? {});
    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    try {
      const result = await PartnershipCheckoutSvc.createSponsorshipCheckout(
        req.params.proposalId,
        req.user!.userId,
        value.voucherCode,
      );
      return res.status(201).json({
        invoiceId: result.invoice.id,
        checkoutId: result.checkoutId,
        url: result.url,
        status: result.status,
      });
    } catch (e: unknown) {
      const err = e as Error;
      return res
        .status(statusForCheckoutError(err.message))
        .json({ success: false, message: err.message });
    }
  }

  // POST /v1/partnerships/:proposalId/cancel
  static async cancelSponsorship(req: Request, res: Response) {
    try {
      const result = await PartnershipCheckoutSvc.cancelSponsorship(
        req.params.proposalId,
        req.user!.userId,
      );
      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (e: unknown) {
      const err = e as Error;
      return res
        .status(statusForCheckoutError(err.message))
        .json({ success: false, message: err.message });
    }
  }

  // GET /v1/invoices/:id
  static async getInvoiceStatus(req: Request, res: Response) {
    try {
      const result = await InvoiceSvc.getInvoiceStatus(req.params.id);
      const { userId, systemRole } = req.user!;
      if (result.payerId !== userId && !can(systemRole, "payments:read:all")) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized: you may only view your own invoices",
        });
      }
      return res.status(200).json({
        invoiceId: result.invoiceId,
        status: result.status,
        paymentStatus: result.paymentStatus,
      });
    } catch (e: unknown) {
      const err = e as Error;
      const status = err.message.includes("not found") ? 404 : 400;
      return res.status(status).json({ success: false, message: err.message });
    }
  }
}
