import { Request, Response } from "express";
import EventTransactionSvc from "../services/event-transaction.service";
import Joi from "joi";
import { TransactionStatus } from "@prisma/client";

export default class EventTransactionCtrl {
    // CREATE ASSET
    static async createAssetTransaction(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                eventId: Joi.string().required(),
                assetId: Joi.string().required(),
                providerId: Joi.string().required(),
                quantity: Joi.number().integer().min(1).default(1),
            });

            const { error, value } = schema.validate(req.body);
            if (error) return res.status(400).json({ message: error.message });

            const hostId = (req as any).user?.userId;
            const tx = await EventTransactionSvc.createAssetTransaction({ ...value, hostId });
            return res.status(201).json(tx);
        } catch (error: any) {
            return res.status(500).json({ message: error.message });
        }
    }

    // CREATE SERVICE
    static async createServiceTransaction(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                eventId: Joi.string().required(),
                serviceId: Joi.string().required(),
                providerId: Joi.string().required(),
            });

            const { error, value } = schema.validate(req.body);
            if (error) return res.status(400).json({ message: error.message });

            const hostId = (req as any).user?.userId;
            const tx = await EventTransactionSvc.createServiceTransaction({ ...value, hostId });
            return res.status(201).json(tx);
        } catch (error: any) {
            return res.status(500).json({ message: error.message });
        }
    }

    // CREATE VENUE
    static async createVenueTransaction(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                eventId: Joi.string().required(),
                venueId: Joi.string().required(),
                providerId: Joi.string().required(),
            });

            const { error, value } = schema.validate(req.body);
            if (error) return res.status(400).json({ message: error.message });

            const hostId = (req as any).user?.userId;
            const tx = await EventTransactionSvc.createVenueTransaction({ ...value, hostId });
            return res.status(201).json(tx);
        } catch (error: any) {
            return res.status(500).json({ message: error.message });
        }
    }

    // REVIEW TRANSACTION (Role Specific)
    static async reviewTransaction(req: Request, res: Response) {
        try {
            const { type, id } = req.params;
            const { status, agreedPrice } = req.body;

            if (!['asset', 'service', 'venue'].includes(type)) {
                return res.status(400).json({ message: "Invalid transaction type" });
            }

            const requesterRole = (req as any).user?.roleType || [];
            
            const updated = await EventTransactionSvc.updateTransactionStatus({
                type: type as any,
                id,
                status: status as TransactionStatus,
                agreedPrice,
                requesterRole
            });

            return res.status(200).json(updated);
        } catch (error: any) {
            const status = error.message.includes("Unauthorized") ? 403 : 400;
            return res.status(status).json({ message: error.message });
        }
    }

    // GET BY EVENT
    static async getEventTransactions(req: Request, res: Response) {
        try {
            const txs = await EventTransactionSvc.getTransactionsByEvent(req.params.eventId);
            return res.status(200).json(txs);
        } catch (error: any) {
            return res.status(500).json({ message: error.message });
        }
    }
}