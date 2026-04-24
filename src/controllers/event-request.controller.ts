import { Request, Response } from "express";
import EventRequestSvc from "../services/event-request.service";
import Joi from "joi";

export default class EventRequestCtrl {
  static async create(req: Request, res: Response) {
    const schema = Joi.object({
      templateId: Joi.string().uuid().required(),
      name: Joi.string().required(),
      description: Joi.string().required(),
      startAt: Joi.date().iso().required(),
      endAt: Joi.date().iso().required().greater(Joi.ref('startAt')),
      guestCount: Joi.number().integer().min(1).required(),
      totalAmount: Joi.number().min(0).required(),
    });

    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ message: error.message });

    try {
      const clientId = (req as any).user.userId;
      const request = await EventRequestSvc.spawnRequestFromTemplate({
        clientId,
        ...value,
      });
      return res.status(201).json({ message: "Event request created successfully", request });
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
  }

  static async listMyRequests(req: Request, res: Response) {
    try {
      const clientId = (req as any).user.userId;
      const requests = await EventRequestSvc.getMyRequests(clientId);
      return res.status(200).json({ requests });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  }

  static async getById(req: Request, res: Response) {
    try {
      const request = await EventRequestSvc.getRequestById(req.params.id);
      return res.status(200).json({ request });
    } catch (error: any) {
      return res.status(404).json({ message: error.message });
    }
  }
}
