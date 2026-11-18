import { sendServerError } from "../../utils/errors";
import { Request, Response } from "express";
import Joi from "joi";
import { PayoutFailureReason, PayoutStatus } from "@prisma/client";
import PayoutSvc from "./payout.service";
import PaymentDisputeSvc from "../payment/payment-dispute.service";

const adminListSchema = Joi.object({
  status: Joi.string()
    .valid(...Object.values(PayoutStatus))
    .default(PayoutStatus.failed),
  failureReason: Joi.string().valid(...Object.values(PayoutFailureReason)),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

const disputeListSchema = Joi.object({
  status: Joi.string().max(40),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

export default class PayoutCtrl {
  // GET /v1/payouts/me
  static async getMyPayouts(req: Request, res: Response) {
    try {
      const providerId = req.user!.userId;
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 20;

      const result = await PayoutSvc.getPayoutsForProvider(
        providerId,
        page,
        limit,
      );

      return res.status(200).json({
        success: true,
        data: result.payouts,
        pagination: result.pagination,
        totals: result.totals,
      });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: true });
    }
  }

  // GET /v1/admin/payouts?status=failed&failureReason=&page=&limit=
  static async listForAdmin(req: Request, res: Response) {
    try {
      const { error, value } = adminListSchema.validate(req.query);
      if (error) {
        return res.status(400).json({ success: false, message: error.message });
      }
      const result = await PayoutSvc.listForAdmin(value);
      return res.status(200).json({
        success: true,
        data: result.payouts,
        pagination: result.pagination,
      });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: true });
    }
  }

  // POST /v1/admin/payouts/:id/retry
  static async retry(req: Request, res: Response) {
    try {
      const payout = await PayoutSvc.retryPayout(req.params.id, {
        userId: req.user!.userId,
        email: req.user!.email,
      });
      return res.status(200).json({ success: true, data: payout });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: true });
    }
  }

  // GET /v1/admin/payment-disputes?status=&page=&limit=
  static async listPaymentDisputes(req: Request, res: Response) {
    try {
      const { error, value } = disputeListSchema.validate(req.query);
      if (error) {
        return res.status(400).json({ success: false, message: error.message });
      }
      const result = await PaymentDisputeSvc.list(value);
      return res.status(200).json({
        success: true,
        data: result.disputes,
        pagination: result.pagination,
      });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: true });
    }
  }
}
