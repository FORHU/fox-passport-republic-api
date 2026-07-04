import { Request, Response } from "express";
import EventRequestSvc from "../services/event-request.service";
import EventRequestRepo from "../repositories/event-request.repository";
import Joi from "joi";

export default class EventRequestCtrl {
  static async spawnRequest(req: Request, res: Response) {
    const schema = Joi.object({
      templateId: Joi.string().optional(),
      venueId: Joi.string().optional(),
      name: Joi.string().required(),
      description: Joi.string().required(),
      eventType: Joi.string().optional(),
      startDatetime: Joi.date().optional(),
      startAt: Joi.date().optional(),
      endDatetime: Joi.date().optional(),
      endAt: Joi.date().optional(),
      maxAttendees: Joi.number().min(1).optional(),
      guestCount: Joi.number().min(1).optional(),
      totalPrice: Joi.number().min(0).optional(),
      totalAmount: Joi.number().min(0).optional(),
      currency: Joi.string().optional(),
    }).or('templateId', 'venueId');

    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.message });

    try {
      const clientId = (req as any).user.userId;
      const templateId = value.templateId;

      let request;
      if (templateId) {
        request = await EventRequestSvc.spawnRequestFromTemplate({
          templateId,
          clientId,
          name: value.name,
          description: value.description,
          startAt: value.startAt || value.startDatetime,
          endAt: value.endAt || value.endDatetime,
          guestCount: value.guestCount || value.maxAttendees || 1,
          totalAmount: value.totalAmount || value.totalPrice,
        });
      } else {
        request = await EventRequestSvc.createDirectEvent({
          clientId,
          name: value.name,
          description: value.description,
          eventCategory: value.eventType || "other",
          startAt: value.startAt || value.startDatetime,
          endAt: value.endAt || value.endDatetime,
          guestCount: value.guestCount || value.maxAttendees || 1,
          totalAmount: value.totalAmount || value.totalPrice,
          currency: value.currency,
        });
      }
      return res.status(201).json({ success: true, data: { id: request.id } });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  static async approve(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { userId, systemRole } = (req as any).user;
      const updated = await EventRequestSvc.approveRequest(id, userId, systemRole);
      return res.status(200).json({ success: true, data: updated });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  static async complete(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const updated = await EventRequestSvc.completeEvent(id);
      return res.status(200).json({ success: true, data: updated });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  static async listApproved(req: Request, res: Response) {
    try {
      const events = await EventRequestRepo.findAllApproved();
      return res.status(200).json({ success: true, data: events });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static async listMyRequests(req: Request, res: Response) {
    try {
      const clientId = (req as any).user.userId;
      const requests = await EventRequestSvc.getMyRequests(clientId);
      return res.status(200).json({ success: true, data: requests });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const request = await EventRequestSvc.getRequestById(id);
      return res.status(200).json({ success: true, data: request });
    } catch (error: any) {
      return res.status(404).json({ success: false, message: error.message });
    }
  }
}
