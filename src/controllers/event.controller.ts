import { Request, Response } from "express";
import Joi from "joi";
import EventSvc from "../services/event.service";

export default class EventController {
    // GET ALL EVENTS
    static async getAllEvents(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                hostId: Joi.string().uuid().optional(),
                categoryId: Joi.string().uuid().optional(),
                status: Joi.string().optional(),
                isPublished: Joi.boolean().optional(),
            });

            const { error, value } = schema.validate(req.query);
            if (error) {
                return res.status(400).json({ message: error.message });
            }

            const events = await EventSvc.getAllEvents(value);
            return res.status(200).json({
                success: true,
                count: events.length,
                data: events,
            });
        } catch (error: any) {
            console.error("Get all events error:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch events",
            });
        }
    }

    // GET EVENT BY ID
    static async getEventById(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                id: Joi.string().uuid().required(),
            });

            const { error, value } = schema.validate(req.params);
            if (error) {
                return res.status(400).json({ message: error.message });
            }

            const event = await EventSvc.getEventById(value.id);
            return res.status(200).json({
                success: true,
                data: event,
            });
        } catch (error: any) {
            console.error("Get event by ID error:", error);
            if (error.message === "Event not found") {
                return res.status(404).json({
                    success: false,
                    message: error.message,
                });
            }
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch event",
            });
        }
    }

    // CREATE EVENT
    static async createEvent(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                hostId: Joi.string().uuid().required(),
                categoryId: Joi.string().uuid().optional(),
                title: Joi.string().min(3).max(200).required(),
                description: Joi.string().min(10).required(),
                status: Joi.string().valid("draft", "active", "cancelled", "completed").optional(),
                maxAttendees: Joi.number().integer().min(1).optional(),
                isPublished: Joi.boolean().optional(),
            });

            const { error, value } = schema.validate(req.body);
            if (error) {
                return res.status(400).json({ message: error.message });
            }

            const event = await EventSvc.createEvent(value);
            return res.status(201).json({
                success: true,
                message: "Event created successfully",
                data: event,
            });
        } catch (error: any) {
            console.error("Create event error:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to create event",
            });
        }
    }

    // CREATE COMPLETE EVENT (with details, pricing, and images)
    static async createCompleteEvent(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                hostId: Joi.string().uuid().required(),
                categoryId: Joi.string().uuid().optional(),
                title: Joi.string().min(3).max(200).required(),
                description: Joi.string().min(10).required(),
                status: Joi.string().valid("draft", "active", "cancelled", "completed").optional(),
                maxAttendees: Joi.number().integer().min(1).optional(),
                isPublished: Joi.boolean().optional(),
                details: Joi.object({
                    locationAddress: Joi.string().required(),
                    city: Joi.string().required(),
                    state: Joi.string().required(),
                    country: Joi.string().required(),
                    latitude: Joi.number().optional(),
                    longitude: Joi.number().optional(),
                    startDatetime: Joi.date().required(),
                    endDatetime: Joi.date().greater(Joi.ref("startDatetime")).required(),
                    durationMinutes: Joi.number().integer().min(1).optional(),
                    requirements: Joi.string().optional(),
                    cancellationPolicy: Joi.string().optional(),
                    itineraryJson: Joi.string().optional(),
                }).optional(),
                pricing: Joi.object({
                    basePrice: Joi.number().min(0).required(),
                    currency: Joi.string().length(3).uppercase().optional(),
                    serviceFeePercent: Joi.number().min(0).max(100).optional(),
                    taxPercent: Joi.number().min(0).max(100).optional(),
                    pricingTiers: Joi.any().optional(),
                    earlyBirdDiscount: Joi.any().optional(),
                    earlyBirdDeadline: Joi.date().optional(),
                }).optional(),
                images: Joi.array()
                    .items(
                        Joi.object({
                            imageUrl: Joi.string().uri().required(),
                            altText: Joi.string().optional(),
                            displayOrder: Joi.number().integer().optional(),
                            isPrimary: Joi.boolean().optional(),
                        })
                    )
                    .optional(),
            });

            const { error, value } = schema.validate(req.body);
            if (error) {
                return res.status(400).json({ message: error.message });
            }

            const event = await EventSvc.createCompleteEvent(value);
            return res.status(201).json({
                success: true,
                message: "Complete event created successfully",
                data: event,
            });
        } catch (error: any) {
            console.error("Create complete event error:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to create complete event",
            });
        }
    }

    // UPDATE EVENT
    static async updateEvent(req: Request, res: Response) {
        try {
            const paramsSchema = Joi.object({
                id: Joi.string().uuid().required(),
            });

            const { error: paramsError, value: params } = paramsSchema.validate(req.params);
            if (paramsError) {
                return res.status(400).json({ message: paramsError.message });
            }

            const bodySchema = Joi.object({
                userId: Joi.string().uuid().required(), // Should come from auth middleware
                categoryId: Joi.string().uuid().optional(),
                title: Joi.string().min(3).max(200).optional(),
                description: Joi.string().min(10).optional(),
                status: Joi.string().valid("draft", "active", "cancelled", "completed").optional(),
                maxAttendees: Joi.number().integer().min(1).optional(),
                isPublished: Joi.boolean().optional(),
            });

            const { error: bodyError, value: body } = bodySchema.validate(req.body);
            if (bodyError) {
                return res.status(400).json({ message: bodyError.message });
            }

            const { userId, ...updateData } = body;
            const event = await EventSvc.updateEvent(params.id, userId, updateData);

            return res.status(200).json({
                success: true,
                message: "Event updated successfully",
                data: event,
            });
        } catch (error: any) {
            console.error("Update event error:", error);
            if (error.message === "Event not found") {
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
                message: error.message || "Failed to update event",
            });
        }
    }

    // DELETE EVENT
    static async deleteEvent(req: Request, res: Response) {
        try {
            const paramsSchema = Joi.object({
                id: Joi.string().uuid().required(),
            });

            const { error: paramsError, value: params } = paramsSchema.validate(req.params);
            if (paramsError) {
                return res.status(400).json({ message: paramsError.message });
            }

            const bodySchema = Joi.object({
                userId: Joi.string().uuid().required(), // Should come from auth middleware
            });

            const { error: bodyError, value: body } = bodySchema.validate(req.body);
            if (bodyError) {
                return res.status(400).json({ message: bodyError.message });
            }

            await EventSvc.deleteEvent(params.id, body.userId);

            return res.status(200).json({
                success: true,
                message: "Event deleted successfully",
            });
        } catch (error: any) {
            console.error("Delete event error:", error);
            if (error.message === "Event not found") {
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
                message: error.message || "Failed to delete event",
            });
        }
    }

    // UPDATE EVENT DETAILS
    static async updateEventDetails(req: Request, res: Response) {
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
                locationAddress: Joi.string().optional(),
                city: Joi.string().optional(),
                state: Joi.string().optional(),
                country: Joi.string().optional(),
                latitude: Joi.number().optional(),
                longitude: Joi.number().optional(),
                startDatetime: Joi.date().optional(),
                endDatetime: Joi.date().optional(),
                durationMinutes: Joi.number().integer().min(1).optional(),
                requirements: Joi.string().optional(),
                cancellationPolicy: Joi.string().optional(),
                itineraryJson: Joi.string().optional(),
            });

            const { error: bodyError, value: body } = bodySchema.validate(req.body);
            if (bodyError) {
                return res.status(400).json({ message: bodyError.message });
            }

            const { userId, ...updateData } = body;
            const details = await EventSvc.updateEventDetails(params.id, userId, updateData);

            return res.status(200).json({
                success: true,
                message: "Event details updated successfully",
                data: details,
            });
        } catch (error: any) {
            console.error("Update event details error:", error);
            if (error.message.includes("Unauthorized")) {
                return res.status(403).json({
                    success: false,
                    message: error.message,
                });
            }
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to update event details",
            });
        }
    }

    // ADD EVENT IMAGE
    static async addEventImage(req: Request, res: Response) {
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
                imageUrl: Joi.string().uri().required(),
                altText: Joi.string().optional(),
                displayOrder: Joi.number().integer().optional(),
                isPrimary: Joi.boolean().optional(),
            });

            const { error: bodyError, value: body } = bodySchema.validate(req.body);
            if (bodyError) {
                return res.status(400).json({ message: bodyError.message });
            }

            const { userId, ...imageData } = body;
            const image = await EventSvc.addEventImage(params.id, userId, imageData);

            return res.status(201).json({
                success: true,
                message: "Event image added successfully",
                data: image,
            });
        } catch (error: any) {
            console.error("Add event image error:", error);
            if (error.message.includes("Unauthorized")) {
                return res.status(403).json({
                    success: false,
                    message: error.message,
                });
            }
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to add event image",
            });
        }
    }
}