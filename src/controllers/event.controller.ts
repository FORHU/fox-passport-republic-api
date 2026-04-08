import { Request, Response } from "express";
import Joi from "joi";
import EventSvc from "../services/event.service";
import { EventStatus, EventType } from "@prisma/client";

export default class EventCtrl {
    static async getAllEvents(req: Request, res: Response) {
        try {
            const events = await EventSvc.getAllEvents(req.query);
            return res.status(200).json({ success: true, data: events });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    static async getEventById(req: Request, res: Response) {
        try {
            const event = await EventSvc.getEventById(req.params.id);
            return res.status(200).json({ success: true, data: event });
        } catch (error: any) {
            return res.status(404).json({ success: false, message: error.message });
        }
    }

    static async createEvent(req: Request, res: Response) {
        try {
            const userId = (req as any).user?.userId;
            if (!userId) {
                return res.status(401).json({ success: false, message: "User not authenticated" });
            }
            const event = await EventSvc.createEvent({
                organizerId: userId,
                ...req.body
            });
            return res.status(201).json({ success: true, data: event });
        } catch (error: any) {
            return res.status(400).json({ success: false, message: error.message });
        }
    }

    static async updateEvent(req: Request, res: Response) {
        const schema = Joi.object({
            name: Joi.string().optional(),
            description: Joi.string().optional(),
            eventType: Joi.string().lowercase().valid(...Object.values(EventType)).optional(),
            startDatetime: Joi.date().optional(),
            endDatetime: Joi.date().optional(),
            maxAttendees: Joi.number().integer().min(1).optional(),
            totalPrice: Joi.number().min(0).optional(),
            currency: Joi.string().optional(),
            status: Joi.string().lowercase().valid(...Object.values(EventStatus)).optional(),
            venueId: Joi.string().uuid().optional(),
        }).min(1);

        const { error, value } = schema.validate(req.body, { stripUnknown: true });
        if (error) {
            return res.status(400).json({ success: false, message: error.message });
        }

        try {
            const { id } = req.params;
            const userId = (req as any).user?.userId;
            if (!userId) {
                return res.status(401).json({ success: false, message: "User not authenticated" });
            }
            const event = await EventSvc.updateEvent(id, userId, value);
            return res.status(200).json({ success: true, data: event });
        } catch (error: any) {
            return res.status(400).json({ success: false, message: error.message });
        }
    }
}
