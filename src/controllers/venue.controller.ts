import { Request, Response } from "express";
import Joi from "joi";
import VenueSvc from "../services/venue.service";
import { VenueStatus } from "@prisma/client";

export default class VenueCtrl {

    // Create Venue Controller
    static async createVenue(req: Request, res: Response) {
        const schema = Joi.object({
            name: Joi.string().required(),
            description: Joi.string().required(),
            category: Joi.string().required(),
            capacity: Joi.number().integer().min(1).required(),
            address: Joi.string().required(),
            city: Joi.string().required(),
            state: Joi.string().optional(),
            country: Joi.string().required(),
            imgIds: Joi.array().items(Joi.string()).max(5).required(),
            spaceType: Joi.array().items(Joi.string()).optional(),
            amenities: Joi.array().items(Joi.string()).optional(),
            techAv: Joi.array().items(Joi.string()).optional(),
            staffing: Joi.array().items(Joi.string()).optional(),
            policies: Joi.array().items(Joi.string()).optional(),
            status: Joi.string().valid(...Object.values(VenueStatus)).optional(),
            price: Joi.number().min(0).optional(),
            billingRate: Joi.string().valid("hourly", "daily", "weekly", "monthly", "yearly", "one_time").default("daily"),
        });

        const { error, value } = schema.validate(req.body);
        if (error) {
            return res.status(400).json({ message: error.message });
        }

        try {
            // hostId comes from the authenticated user's JWT token
            const hostId = (req as any).user?.userId;
            if (!hostId) {
                return res.status(401).json({ message: "Unauthorized" });
            }

            const venueData = { ...value, hostId };
            const venue = await VenueSvc.createVenue(venueData);
            return res.status(201).json({ message: "Venue created successfully", venue });
        } catch (error: any) {
            return res.status(400).json({ message: error.message || error });
        }
    }

    // READ Venues Controller with optional query parameters for filtering
    static async getVenues(req: Request, res: Response) {
        try {
            const venues = await VenueSvc.getVenues();

            return res.status(200).json({ venues });
        } catch (error: any) {
            return res.status(500).json({ message: error.message || error });
        }
    }

    // READ Venue by ID Controller
    static async getVenueById(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const venue = await VenueSvc.getVenueById(id);
            return res.status(200).json({ venue });
        } catch (error: any) {
            return res.status(404).json({ message: error.message || error });
        }
    }

    static async updateVenue(req: Request, res: Response) {
        const schema = Joi.object({
            name: Joi.string().optional(),
            description: Joi.string().optional(),
            category: Joi.string().optional(),
            capacity: Joi.number().integer().min(1).optional(),
            price: Joi.number().min(0).optional(),
            
            address: Joi.string().optional(),
            city: Joi.string().optional(),
            state: Joi.string().optional(),
            country: Joi.string().optional(),
            imgIds: Joi.array().items(Joi.string()).max(5).optional(),
            spaceType: Joi.array().items(Joi.string()).optional(),
            amenities: Joi.array().items(Joi.string()).optional(),
            techAv: Joi.array().items(Joi.string()).optional(),
            staffing: Joi.array().items(Joi.string()).optional(),
            policies: Joi.array().items(Joi.string()).optional(),
            status: Joi.string().valid(...Object.values(VenueStatus)).optional(),
            billingRate: Joi.string().valid("hourly", "daily", "weekly", "monthly", "yearly", "one_time").optional(),
        }).min(1);

        const { error, value } = schema.validate(req.body);
        if (error) {
            return res.status(400).json({ message: error.message });
        }

        try {
            const requesterId = (req as any).user?.userId as string | undefined;
            if (!requesterId) return res.status(401).json({ message: "Unauthorized" });

            const venue = await VenueSvc.updateVenue({
                id: String(req.params.id),
                requesterId,
                data: value,
            });
            return res.status(200).json({ message: "Venue updated successfully", venue });
        } catch (err: any) {
            const status = err.message === "Unauthorized" ? 403 : err.message === "Venue not found" ? 404 : 400;
            return res.status(status).json({ message: err.message || err });
        }
    }

    static async deleteVenue(req: Request, res: Response) {
        try {
            const requesterId = (req as any).user?.userId as string | undefined;
            const requesterRole = (req as any).user?.role as string | undefined;
            if (!requesterId) return res.status(401).json({ message: "Unauthorized" });

            await VenueSvc.deleteVenue({
                id: String(req.params.id),
                requesterId,
                requesterRole,
            });
            return res.status(200).json({ message: "Venue deleted successfully" });
        } catch (err: any) {
            const status = err.message === "Unauthorized" ? 403 : err.message === "Venue not found" ? 404 : 400;
            return res.status(status).json({ message: err.message || err });
        }
    }
}