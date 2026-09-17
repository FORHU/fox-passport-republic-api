import { Request, Response } from "express";
import EventTransactionSvc from "./event-transaction.service";
import Joi from "joi";

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
      action: Joi.string().valid("confirm", "reject", "cancel").required(),
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
      return res
        .status(200)
        .json({ message: `Item ${value.action}ed successfully`, updated });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(400).json({ message: error.message });
    }
  }
}
