import { Request, Response } from "express";
import Joi from "joi";
import VenueSvc from "../services/venue.service";
import { VenueType, VenueStatus } from "@prisma/client";

export default class VenueCtrl {

    // Create Venue Controller
    static async createVenue(req: Request, res: Response) {
        const schema = Joi.object({
            name: Joi.string().required(),
            description: Joi.string().required(),
            type: Joi.string().valid(...Object.values(VenueType)).required(),
            capacity: Joi.number().integer().min(1).required(),
            address: Joi.string().required(),
            city: Joi.string().required(),
            state: Joi.string().optional(),
            country: Joi.string().required(),
            //latitude: Joi.number().optional(),
            //longitude: Joi.number().optional(),
            spaceType: Joi.array().items(Joi.string()).optional(),
            amenities: Joi.array().items(Joi.string()).optional(),
            techAv: Joi.array().items(Joi.string()).optional(),
            staffing: Joi.array().items(Joi.string()).optional(),
            policies: Joi.array().items(Joi.string()).optional(),
            status: Joi.string().valid(...Object.values(VenueStatus)).optional(),
            price: Joi.number().min(0).optional(),
            images: Joi.array()
                .items(
                    Joi.object({
                        url: Joi.string().uri().required(),
                        altText: Joi.string().optional(),
                        orderIndex: Joi.number().optional(),
                        isThumbnail: Joi.boolean().optional(),
                    })
                )
                .optional(),
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
            const { hostId, type, city, status } = req.query;

            const venues = await VenueSvc.getVenues({
                ...(hostId && { hostId: String(hostId) }),
                ...(type && { type: type as VenueType }),
                ...(city && { city: String(city) }),
                ...(status && { status: status as VenueStatus }),
            });

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

    // UPDATE Venue Controller - allows partial updates; validates fields if provided; checks ownership before updating
    static async updateVenue(req: Request, res: Response) {
        const schema = Joi.object({
            name: Joi.string().optional(),
            description: Joi.string().optional(),
            type: Joi.string().valid(...Object.values(VenueType)).optional(),
            capacity: Joi.number().integer().min(1).optional(),
            address: Joi.string().optional(),
            city: Joi.string().optional(),
            state: Joi.string().optional(),
            country: Joi.string().optional(),
            // latitude: Joi.number().optional(),
            // longitude: Joi.number().optional(),
            spaceType: Joi.array().items(Joi.string()).optional(),
            amenities: Joi.array().items(Joi.string()).optional(),
            techAv: Joi.array().items(Joi.string()).optional(),
            staffing: Joi.array().items(Joi.string()).optional(),
            policies: Joi.array().items(Joi.string()).optional(),
            status: Joi.string().valid(...Object.values(VenueStatus)).optional(),
            price: Joi.number().min(0).optional(),
            images: Joi.array()
                .items(
                    Joi.object({
                        url: Joi.string().uri().required(),
                        altText: Joi.string().optional(),
                        orderIndex: Joi.number().optional(),
                        isThumbnail: Joi.boolean().optional(),
                    })
                )
                .optional(),
        }).min(1);

        const { error, value } = schema.validate(req.body);
        if (error) {
            return res.status(400).json({ message: error.message });
        }

        try {
            const { id } = req.params;
            const { userId: hostId, role: userRole } = (req as any).user || {};
            if (!hostId) {
                return res.status(401).json({ message: "Unauthorized" });
            }

            const venue = await VenueSvc.updateVenue(id, hostId, value, userRole);
            return res.status(200).json({ message: "Venue updated successfully", venue });
        } catch (error: any) {
            return res.status(400).json({ message: error.message || error });
        }
    }

    // DELETE Venue Controller - checks ownership before deleting
    static async deleteVenue(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const user = (req as any).user;
            const requesterId = user?.userId;
            const userRole = user?.role;

            if (!requesterId) {
                return res.status(401).json({ message: "Unauthorized" });
            }

            const result = await VenueSvc.deleteVenue(id, String(requesterId), userRole);
            return res.status(200).json(result);
        } catch (error: any) {
            const status = error.message.includes("authorized") ? 403 : 400;
            return res.status(status).json({ message: error.message || error });
        }
    }

    // IMAGE MANAGEMENT METHODS
    static async uploadVenueImages(req: Request, res: Response) {
        try {
            const user = (req as any).user;
            const userId = user?.userId;
            const userRole = user?.role;
            const { id } = req.params; // venueId
            const files = req.files as Express.Multer.File[];

            if (!userId) {
                return res.status(401).json({ message: "Unauthorized" });
            }

            const images = await VenueSvc.uploadVenueImages({ venueId: id, userId, userRole, files });
            return res.status(201).json({ success: true, data: images });
        } catch (error: any) {
            return res.status(400).json({
                message: error.message || "Failed to upload images",
                error: typeof error === 'object' ? error : String(error)
            });
        }
    }

    static async updateVenueImage(req: Request, res: Response) {
        try {
            const user = (req as any).user;
            const userId = user?.userId;
            const userRole = user?.role;
            const { imageId } = req.params;
            const data = req.body;

            if (!userId) return res.status(401).json({ message: "Unauthorized" });

            const image = await VenueSvc.updateImage(userId, imageId, data, userRole);
            return res.status(200).json({ success: true, data: image });
        } catch (error: any) {
            return res.status(400).json({ message: error.message || error });
        }
    }

    static async deleteVenueImage(req: Request, res: Response) {
        try {
            const user = (req as any).user;
            const userId = user?.userId;
            const userRole = user?.role;
            const { imageId } = req.params;

            if (!userId) return res.status(401).json({ message: "Unauthorized" });

            await VenueSvc.deleteImage(userId, imageId, userRole);
            return res.status(200).json({ success: true, message: "Image deleted successfully" });
        } catch (error: any) {
            return res.status(400).json({ message: error.message || error });
        }
    }
}