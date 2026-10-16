import { sendServerError } from "../../utils/errors";
import { Request, Response } from "express";
import Joi from "joi";
import EventSvc from "./event.service";

export default class EventCtrl {
  static async browsePublic(req: Request, res: Response) {
    const schema = Joi.object({
      city: Joi.string().trim().max(120),
      q: Joi.string().trim().max(120),
      minPrice: Joi.number().min(0),
      maxPrice: Joi.number().min(0),
      minCapacity: Joi.number().integer().min(1),
      fromDate: Joi.date().iso(),
      toDate: Joi.date().iso(),
      sortBy: Joi.string().valid(
        "date_asc",
        "date_desc",
        "price_asc",
        "price_desc",
      ),
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(50).default(20),
    });
    const { error, value } = schema.validate(req.query, {
      convert: true,
      abortEarly: true,
    });
    if (error) return res.status(400).json({ message: error.message });
    if (
      value.minPrice != null &&
      value.maxPrice != null &&
      value.minPrice > value.maxPrice
    ) {
      return res
        .status(400)
        .json({ message: "minPrice must not exceed maxPrice" });
    }
    if (value.fromDate && value.toDate && value.fromDate >= value.toDate) {
      return res.status(400).json({ message: "toDate must be after fromDate" });
    }

    try {
      const result = await EventSvc.getPublicEvents({
        city: value.city,
        query: value.q,
        minPrice: value.minPrice,
        maxPrice: value.maxPrice,
        minCapacity: value.minCapacity,
        fromDate: value.fromDate,
        toDate: value.toDate,
        sortBy: value.sortBy,
        page: value.page,
        limit: value.limit,
      });
      return res.status(200).json({
        success: true,
        data: result.events,
        pagination: {
          page: value.page,
          limit: value.limit,
          total: result.total,
          totalPages: Math.ceil(result.total / value.limit),
        },
      });
    } catch (e: unknown) {
      return sendServerError(res, e);
    }
  }

  static async setPublicVisibility(req: Request, res: Response) {
    const schema = Joi.object({ isPublic: Joi.boolean().required() });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ message: error.message });
    const clientId = req.user?.userId;
    if (!clientId) return res.status(401).json({ message: "Unauthorized" });

    try {
      await EventSvc.setPublicVisibility(
        req.params.id,
        clientId,
        value.isPublic,
      );
      return res
        .status(200)
        .json({ success: true, data: { isPublic: value.isPublic } });
    } catch (e: unknown) {
      return sendServerError(res, e);
    }
  }

  // List events. Currently only serves "events I organize" — used by the
  // Republic Feed compose flow (event_announcement post type needs a real
  // Event id, not an EventTemplate id) and the host dashboard.
  static async getEvents(req: Request, res: Response) {
    try {
      const { organizerId, page, limit } = req.query;
      if (!organizerId) {
        return res.status(400).json({ message: "organizerId is required" });
      }

      const pageNum = page ? Math.max(1, Number(page)) : 1;
      const take = limit ? Math.min(Number(limit), 50) : 20;

      const { events, total } = await EventSvc.getEventsByOrganizer(
        String(organizerId),
        pageNum,
        take,
      );

      return res.status(200).json({ events, total });
    } catch (e: unknown) {
      return sendServerError(res, e);
    }
  }
}
