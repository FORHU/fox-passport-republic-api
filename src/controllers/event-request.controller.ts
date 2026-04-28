import { Request, Response } from "express";
import EventRequestSvc from "../services/event-request.service";
import EventRequestRepo from "../repositories/event-request.repository";
import Joi from "joi";

export default class EventRequestCtrl {
  static async spawnRequest(req: Request, res: Response) {
    const schema = Joi.object({
      templateId: Joi.string().required(),
      name: Joi.string().required(),
      description: Joi.string().required(),
      startAt: Joi.date().required(),
      endAt: Joi.date().required(),
      guestCount: Joi.number().min(1).required(),
      totalAmount: Joi.number().min(0).required(),
    });

    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ message: error.message });

    try {
      const clientId = (req as any).user.userId;
      const request = await EventRequestSvc.spawnRequestFromTemplate({
        ...value,
        clientId,
      });
      return res.status(201).json(request);
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
  }

  static async approve(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { userId, systemRole } = (req as any).user;
      const updated = await EventRequestSvc.approveRequest(id, userId, systemRole);
      return res.status(200).json({ message: "Request approved", updated });
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
  }

  static async complete(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const updated = await EventRequestSvc.completeEvent(id);
      return res.status(200).json({ message: "Event completed", updated });
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
  }

  static async listApproved(req: Request, res: Response) {
    try {
      const events = await EventRequestRepo.findAllApproved();
      return res.status(200).json({ success: true, data: events });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  }

  static async listMyRequests(req: Request, res: Response) {
    try {
      const clientId = (req as any).user.userId;
      const requests = await EventRequestSvc.getMyRequests(clientId);
      return res.status(200).json(requests);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  }

  static async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const request = await EventRequestSvc.getRequestById(id);
      return res.status(200).json(request);
    } catch (error: any) {
      return res.status(404).json({ message: error.message });
    }
  }
}
