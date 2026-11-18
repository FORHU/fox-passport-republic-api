import { Request, Response } from "express";
import EventTransactionSvc from "./event-transaction.service";
import EventConflictSvc from "./event-conflict.service";
import Joi from "joi";
import { AppError } from "../../utils/errors";

export default class EventTransactionCtrl {
  static async listProviderItems(req: Request, res: Response) {
    try {
      const providerId = req.user?.userId;
      if (!providerId) return res.status(401).json({ message: "Unauthorized" });
      const data = await EventTransactionSvc.getProviderDashboard(providerId);
      return res.status(200).json(data);
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(500).json({ message: error.message });
    }
  }

  /**
   * GET /event-transactions/needs-attention: the Event Foxer's upcoming
   * events that lost a Supplier (declined, a blocked day, a listing taken
   * down), and which Supplier. Always about the signed-in person's own events.
   */
  static async needsAttention(req: Request, res: Response) {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const data = await EventConflictSvc.needsAttention(userId);
      return res.status(200).json({ success: true, data });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(500).json({ message: error.message });
    }
  }

  static async createTransactions(req: Request, res: Response) {
    const schema = Joi.object({
      eventId: Joi.string().required(),
      bookingId: Joi.string().required(),
    });

    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ message: error.message });

    try {
      const transactions =
        await EventTransactionSvc.createTransactionsFromTemplate(
          value.eventId,
          value.bookingId,
        );
      return res
        .status(201)
        .json({ message: "Transactions created successfully", transactions });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(400).json({ message: error.message });
    }
  }

  static async reviewItem(req: Request, res: Response) {
    // `action`, never a raw status — see TransactionStatusSvc.transition and
    // the allow-list it enforces. This is the fix for the previously-live
    // gap where any TransactionStatus enum value was accepted directly.
    const schema = Joi.object({
      type: Joi.string().valid("asset", "service", "venue").required(),
      action: Joi.string()
        .valid("confirm", "reject", "cancel", "decline")
        .required(),
    });

    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ message: error.message });

    try {
      const { id } = req.params;
      const actorId = req.user?.userId;
      if (!actorId) return res.status(401).json({ message: "Unauthorized" });
      const updated = await EventTransactionSvc.reviewItem(
        id,
        value.type,
        value.action,
        actorId,
      );
      const done = {
        confirm: "confirmed",
        reject: "rejected",
        cancel: "cancelled",
        decline: "declined",
      }[value.action as string];
      return res
        .status(200)
        .json({ message: `Item ${done} successfully`, updated });
    } catch (e: unknown) {
      if (e instanceof AppError) {
        return res.status(e.status).json({ message: e.message, code: e.code });
      }
      const error = e as Error;
      return res.status(400).json({ message: error.message });
    }
  }
}
