import { Request, Response } from "express";
import EventRequestSvc from "./event-request.service";
import Joi from "joi";
import {
  VALIDATE_ALL,
  endAfter,
  sendValidationError,
} from "../../utils/validation";
import {
  EVENT_DESCRIPTION_MAX,
  descriptionJoi,
  nameJoi,
  priceJoi,
  quantityJoi,
} from "../../utils/limits";

export default class EventRequestCtrl {
  static async spawnRequest(req: Request, res: Response) {
    const schema = Joi.object({
      templateId: Joi.string().optional(),
      venueId: Joi.string().optional(),
      name: nameJoi().required(),
      description: descriptionJoi(EVENT_DESCRIPTION_MAX).required(),
      eventType: Joi.string().optional(),
      startDatetime: Joi.date().optional(),
      startAt: Joi.date().optional(),
      endDatetime: endAfter(["startDatetime", "startAt"]).optional(),
      endAt: endAfter(["startDatetime", "startAt"]).optional(),
      maxAttendees: quantityJoi().optional(),
      guestCount: quantityJoi().optional(),
      totalPrice: priceJoi().optional(),
      totalAmount: priceJoi().optional(),
      currency: Joi.string().optional(),
    }).or("templateId", "venueId");

    const { error, value } = schema.validate(req.body, VALIDATE_ALL);
    if (error) return sendValidationError(res, error, { success: true });

    try {
      const clientId = req.user?.userId;
      if (!clientId)
        return res
          .status(401)
          .json({ success: false, message: "Unauthorized" });
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
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  static async listApproved(req: Request, res: Response) {
    try {
      const events = await EventRequestSvc.findAllApproved();
      return res.status(200).json({ success: true, data: events });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static async listMyRequests(req: Request, res: Response) {
    try {
      const clientId = req.user?.userId;
      if (!clientId)
        return res
          .status(401)
          .json({ success: false, message: "Unauthorized" });
      const requests = await EventRequestSvc.getMyRequests(clientId);
      return res.status(200).json({ success: true, data: requests });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const request = await EventRequestSvc.getRequestById(id, req.user);
      return res.status(200).json({ success: true, data: request });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(404).json({ success: false, message: error.message });
    }
  }
}
