import { Request, Response } from "express";
import EventTransactionSvc from "../services/event-transaction.service";
import Joi from "joi";
import { TransactionStatus } from "@prisma/client";

export default class EventTransactionCtrl {
  static async listProviderItems(req: Request, res: Response) {
    try {
      const providerId = (req as any).user.userId;
      const data = await EventTransactionSvc.getProviderDashboard(providerId);
      return res.status(200).json(data);
    } catch (error: any) {
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
      const transactions = await EventTransactionSvc.createTransactionsFromTemplate(value.eventId, value.bookingId);
      return res.status(201).json({ message: "Transactions created successfully", transactions });
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
  }

  static async reviewItem(req: Request, res: Response) {
    const schema = Joi.object({
      type: Joi.string().valid("asset", "service", "venue").required(),
      status: Joi.string().valid(...Object.values(TransactionStatus)).required(),
      agreedPrice: Joi.number().min(0).optional(),
    });

    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ message: error.message });

    try {
      const { id } = req.params;
      const providerId = (req as any).user.userId;
      const updated = await EventTransactionSvc.reviewItem(id, value.type, value.status, value.agreedPrice, providerId);
      return res.status(200).json({ message: `Item ${value.status} successfully`, updated });
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
  }
}
