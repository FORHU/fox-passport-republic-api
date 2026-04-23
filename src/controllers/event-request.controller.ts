import { Request, Response } from "express";
import EventRequestSvc from "../services/event-request.service";
import Joi from "joi";

export default class EventRequestCtrl {
    static async createRequest(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                organizerId: Joi.string().required(),
                templateId: Joi.string().required(),
                name: Joi.string().required(),
                description: Joi.string().required(),
                startAt: Joi.date().required(),
                endAt: Joi.date().required(),
                guestCount: Joi.number().integer().min(1).required(),
                totalAmount: Joi.number().min(0).required(),
            });

            const { error, value } = schema.validate(req.body);
            if (error) return res.status(400).json({ message: error.message });

            const userId = (req as any).user?.userId;
            const request = await EventRequestSvc.createRequest({
                ...value,
                clientId: userId,
            });

            return res.status(201).json(request);
        } catch (error: any) {
            return res.status(500).json({ message: error.message });
        }
    }

    static async getMyRequests(req: Request, res: Response) {
        try {
            const userId = (req as any).user?.userId;
            const roleType = (req as any).user?.roleType || [];
            const isHost = roleType.includes("host");
            
            const requests = await EventRequestSvc.getRequests(userId, isHost);
            return res.status(200).json(requests);
        } catch (error: any) {
            return res.status(500).json({ message: error.message });
        }
    }

    static async getRequestById(req: Request, res: Response) {
        try {
            const request = await EventRequestSvc.getRequestById(req.params.id);
            return res.status(200).json(request);
        } catch (error: any) {
            return res.status(404).json({ message: error.message });
        }
    }

    static async reviewRequest(req: Request, res: Response) {
        try {
            const { status } = req.body;
            if (!["approved", "rejected"].includes(status)) {
                return res.status(400).json({ message: "Invalid status" });
            }

            const hostId = (req as any).user?.userId;
            const updated = await EventRequestSvc.reviewRequest(req.params.id, status, hostId);
            
            return res.status(200).json(updated);
        } catch (error: any) {
            const status = error.message.includes("Unauthorized") ? 403 : 404;
            return res.status(status).json({ message: error.message });
        }
    }
}
