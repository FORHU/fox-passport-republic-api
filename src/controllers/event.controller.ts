import { Request, Response } from "express";
import EventSvc from "../services/event.service";

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
            const event = await EventSvc.createEvent({
                organizerId: req.user!.id,
                ...req.body
            });
            return res.status(201).json({ success: true, data: event });
        } catch (error: any) {
            return res.status(400).json({ success: false, message: error.message });
        }
    }
}
