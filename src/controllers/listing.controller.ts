import { Request, Response } from "express";
import Joi from "joi";
import ListingSvc from "../services/listing.service";

export default class ListingController {
    // GET ALL LISTINGS
    static async getAllListings(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                hostId: Joi.string().uuid().optional(),
                categoryId: Joi.string().uuid().optional(),
                status: Joi.string().optional(),
                type: Joi.string().valid("venue", "equipment", "catering", "service").optional(),
            });

            const { error, value } = schema.validate(req.query);
            if (error) {
                return res.status(400).json({ message: error.message });
            }

            const listings = await ListingSvc.getAllListings(value);
            return res.status(200).json({
                success: true,
                count: listings.length,
                data: listings,
            });
        } catch (error: any) {
            console.error("Get all listings error:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch listings",
            });
        }
    }

    // GET LISTING BY ID
    static async getListingById(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                id: Joi.string().uuid().required(),
            });

            const { error, value } = schema.validate(req.params);
            if (error) {
                return res.status(400).json({ message: error.message });
            }

            const listing = await ListingSvc.getListingById(value.id);
            return res.status(200).json({
                success: true,
                data: listing,
            });
        } catch (error: any) {
            console.error("Get listing by ID error:", error);
            if (error.message === "Listing not found") {
                return res.status(404).json({
                    success: false,
                    message: error.message,
                });
            }
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch listing",
            });
        }
    }

    // CREATE LISTING
    static async createListing(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                hostId: Joi.string().uuid().required(),
                categoryId: Joi.string().uuid().optional(),
                title: Joi.string().min(3).max(200).required(),
                description: Joi.string().min(10).required(),
                propertyType: Joi.string().optional(),
                roomType: Joi.string().optional(),
                status: Joi.string().valid("draft", "pending_review", "action_required", "published", "hidden", "suspended", "archived", "banned").optional(),
                type: Joi.string().valid("venue", "equipment", "catering", "service").required(),
                maxAttendees: Joi.number().integer().min(1).optional(),
            });

            const { error, value } = schema.validate(req.body);
            if (error) {
                return res.status(400).json({ message: error.message });
            }

            const listing = await ListingSvc.createListing(value);
            return res.status(201).json({
                success: true,
                message: "Listing created successfully",
                data: listing,
            });
        } catch (error: any) {
            console.error("Create listing error:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to create listing",
            });
        }
    }

    // CREATE COMPLETE LISTING
    static async createCompleteListing(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                hostId: Joi.string().uuid().required(),
                categoryId: Joi.string().uuid().optional(),
                title: Joi.string().min(3).max(200).required(),
                description: Joi.string().min(10).required(),
                propertyType: Joi.string().optional(),
                roomType: Joi.string().optional(),
                status: Joi.string().valid("draft", "pending_review", "action_required", "published", "hidden", "suspended", "archived", "banned").optional(),
                type: Joi.string().valid("venue", "equipment", "catering", "service").required(),
                maxAttendees: Joi.number().integer().min(1).optional(),
                location: Joi.object({
                    streetAddress: Joi.string().required(),
                    city: Joi.string().required(),
                    state: Joi.string().optional(),
                    country: Joi.string().required(),
                    latitude: Joi.number().optional(),
                    longitude: Joi.number().optional(),
                    requirements: Joi.string().optional(),
                    cancellationPolicy: Joi.string().optional(),
                }).optional(),
                pricing: Joi.object({
                    basePrice: Joi.number().min(0).required(),
                    currency: Joi.string().length(3).uppercase().optional(),
                    serviceFeePercent: Joi.number().min(0).max(100).optional(),
                    taxPercent: Joi.number().min(0).max(100).optional(),
                    pricingTiers: Joi.any().optional(),
                }).optional(),
                images: Joi.array()
                    .items(
                        Joi.object({
                            url: Joi.string().uri().required(),
                            altText: Joi.string().optional(),
                            orderIndex: Joi.number().integer().optional(),
                            isThumbnail: Joi.boolean().optional(),
                        })
                    )
                    .optional(),
            });

            const { error, value } = schema.validate(req.body);
            if (error) {
                return res.status(400).json({ message: error.message });
            }

            const listing = await ListingSvc.createCompleteListing(value);
            return res.status(201).json({
                success: true,
                message: "Complete listing created successfully",
                data: listing,
            });
        } catch (error: any) {
            console.error("Create complete listing error:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to create complete listing",
            });
        }
    }

    // UPDATE LISTING
    static async updateListing(req: Request, res: Response) {
        try {
            const paramsSchema = Joi.object({
                id: Joi.string().uuid().required(),
            });

            const { error: paramsError, value: params } = paramsSchema.validate(req.params);
            if (paramsError) {
                return res.status(400).json({ message: paramsError.message });
            }

            const bodySchema = Joi.object({
                userId: Joi.string().uuid().required(),
                categoryId: Joi.string().uuid().optional(),
                title: Joi.string().min(3).max(200).optional(),
                description: Joi.string().min(10).optional(),
                propertyType: Joi.string().optional(),
                roomType: Joi.string().optional(),
                status: Joi.string().valid("draft", "pending_review", "action_required", "published", "hidden", "suspended", "archived", "banned").optional(),
                type: Joi.string().valid("venue", "equipment", "catering", "service").optional(),
                maxAttendees: Joi.number().integer().min(1).optional(),
            });

            const { error: bodyError, value: body } = bodySchema.validate(req.body);
            if (bodyError) {
                return res.status(400).json({ message: bodyError.message });
            }

            const { userId, ...updateData } = body;
            const listing = await ListingSvc.updateListing(params.id, userId, updateData);

            return res.status(200).json({
                success: true,
                message: "Listing updated successfully",
                data: listing,
            });
        } catch (error: any) {
            console.error("Update listing error:", error);
            if (error.message === "Listing not found") {
                return res.status(404).json({
                    success: false,
                    message: error.message,
                });
            }
            if (error.message.includes("Unauthorized")) {
                return res.status(403).json({
                    success: false,
                    message: error.message,
                });
            }
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to update listing",
            });
        }
    }

    // DELETE LISTING
    static async deleteListing(req: Request, res: Response) {
        try {
            const paramsSchema = Joi.object({
                id: Joi.string().uuid().required(),
            });

            const { error: paramsError, value: params } = paramsSchema.validate(req.params);
            if (paramsError) {
                return res.status(400).json({ message: paramsError.message });
            }

            const bodySchema = Joi.object({
                userId: Joi.string().uuid().required(),
            });

            const { error: bodyError, value: body } = bodySchema.validate(req.body);
            if (bodyError) {
                return res.status(400).json({ message: bodyError.message });
            }

            await ListingSvc.deleteListing(params.id, body.userId);

            return res.status(200).json({
                success: true,
                message: "Listing deleted successfully",
            });
        } catch (error: any) {
            console.error("Delete listing error:", error);
            if (error.message === "Listing not found") {
                return res.status(404).json({
                    success: false,
                    message: error.message,
                });
            }
            if (error.message.includes("Unauthorized")) {
                return res.status(403).json({
                    success: false,
                    message: error.message,
                });
            }
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to delete listing",
            });
        }
    }

    // UPDATE LISTING LOCATION
    static async updateListingLocation(req: Request, res: Response) {
        try {
            const paramsSchema = Joi.object({
                id: Joi.string().uuid().required(),
            });

            const { error: paramsError, value: params } = paramsSchema.validate(req.params);
            if (paramsError) {
                return res.status(400).json({ message: paramsError.message });
            }

            const bodySchema = Joi.object({
                userId: Joi.string().uuid().required(),
                streetAddress: Joi.string().optional(),
                city: Joi.string().optional(),
                state: Joi.string().optional(),
                country: Joi.string().optional(),
                latitude: Joi.number().optional(),
                longitude: Joi.number().optional(),
                requirements: Joi.string().optional(),
                cancellationPolicy: Joi.string().optional(),
            });

            const { error: bodyError, value: body } = bodySchema.validate(req.body);
            if (bodyError) {
                return res.status(400).json({ message: bodyError.message });
            }

            const { userId, ...updateData } = body;
            const location = await ListingSvc.updateListingLocation(params.id, userId, updateData);

            return res.status(200).json({
                success: true,
                message: "Listing location updated successfully",
                data: location,
            });
        } catch (error: any) {
            console.error("Update listing location error:", error);
            if (error.message.includes("Unauthorized")) {
                return res.status(403).json({
                    success: false,
                    message: error.message,
                });
            }
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to update listing location",
            });
        }
    }

    // ADD LISTING IMAGE
    static async addListingImage(req: Request, res: Response) {
        try {
            const paramsSchema = Joi.object({
                id: Joi.string().uuid().required(),
            });

            const { error: paramsError, value: params } = paramsSchema.validate(req.params);
            if (paramsError) {
                return res.status(400).json({ message: paramsError.message });
            }

            const bodySchema = Joi.object({
                userId: Joi.string().uuid().required(),
                url: Joi.string().uri().required(),
                altText: Joi.string().optional(),
                orderIndex: Joi.number().integer().optional(),
                isThumbnail: Joi.boolean().optional(),
            });

            const { error: bodyError, value: body } = bodySchema.validate(req.body);
            if (bodyError) {
                return res.status(400).json({ message: bodyError.message });
            }

            const { userId, ...imageData } = body;
            const image = await ListingSvc.addListingImage(params.id, userId, imageData);

            return res.status(201).json({
                success: true,
                message: "Listing image added successfully",
                data: image,
            });
        } catch (error: any) {
            console.error("Add listing image error:", error);
            if (error.message.includes("Unauthorized")) {
                return res.status(403).json({
                    success: false,
                    message: error.message,
                });
            }
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to add listing image",
            });
        }
    }
}