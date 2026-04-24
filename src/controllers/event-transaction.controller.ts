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

  static async reviewItem(req: Request, res: Response) {
    const schema = Joi.object({
      type: Joi.string().valid("asset", "service", "venue").required(),
      status: Joi.string().valid(...Object.values(TransactionStatus)).required(),
    });

    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ message: error.message });

    try {
      const { id } = req.params;
      const updated = await EventTransactionSvc.reviewItem(id, value.type, value.status);
      return res.status(200).json({ message: `Item ${value.status} successfully`, updated });
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
  }
}
