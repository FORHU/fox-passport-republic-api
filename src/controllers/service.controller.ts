import { Request, Response } from "express";
import Joi from "joi";
import ServiceSvc from "../services/service.service";

export default class ServiceCtrl {
    // CREATE SERVICE
    static async createService(req: Request, res: Response) {
        const schema = Joi.object({
            name: Joi.string().required(),
            description: Joi.string().required(),
            category: Joi.string().valid(
                "planning",
                "decoration",
                "catering",
                "photography",
                "videography",
                "entertainment",
                "coordination",
                "other"
            ).required(),
            billingRate: Joi.string().valid("hourly", "daily", "weekly", "monthly", "yearly", "one_time", "other").required(),
            price: Joi.number().positive().required(),
            status: Joi.string().valid("active", "paused", "unavailable").optional(),
            images: Joi.array().items(Joi.any()).optional(),
        });

        const { error, value } = schema.validate(req.body);
        if (error) {
            return res.status(400).json({ message: error.message });
        }

        try {
            const ownerId = (req as any).user?.userId;
            if (!ownerId) {
                return res.status(401).json({ message: "Unauthorized" });
            }

            const service = await ServiceSvc.createService({
                ownerId: String(ownerId),
                ...value,
            });
            return res.status(201).json({ message: "Service created successfully", service });
        } catch (error: any) {
            return res.status(400).json({ message: error.message || error });
        }
    }

    // GET ALL SERVICES
    static async getServices(req: Request, res: Response) {
        try {
            const { ownerId, category, status } = req.query;

            const services = await ServiceSvc.getAllServices({
                ...(ownerId && { ownerId: String(ownerId) }),
                ...(category && { category: category as any }),
                ...(status && { status: status as any }),
            });

            return res.status(200).json({ services });
        } catch (error: any) {
            return res.status(500).json({ message: error.message || error });
        }
    }

    // GET SERVICE BY ID
    static async getServiceById(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const service = await ServiceSvc.getServiceById(id);
            if (!service) {
                return res.status(404).json({ message: "Service not found" });
            }
            return res.status(200).json({ service });
        } catch (error: any) {
            return res.status(500).json({ message: error.message || error });
        }
    }

    // UPDATE SERVICE
    static async updateService(req: Request, res: Response) {
        const schema = Joi.object({
            name: Joi.string().optional(),
            description: Joi.string().optional(),
            category: Joi.string().valid(
                "planning",
                "decoration",
                "catering",
                "photography",
                "videography",
                "entertainment",
                "coordination",
                "other"
            ).optional(),
            billingRate: Joi.string().valid("hourly", "daily", "weekly", "monthly", "yearly", "one_time", "other").optional(),
            price: Joi.number().positive().optional(),
            status: Joi.string().valid("active", "paused", "unavailable").optional(),
            images: Joi.array().items(Joi.any()).optional(),
        }).min(1);

        const { error, value } = schema.validate(req.body, { stripUnknown: true });
        if (error) {
            return res.status(400).json({ message: error.message });
        }

        try {
            const { id } = req.params;
            const ownerId = (req as any).user?.userId;
            if (!ownerId) {
                return res.status(401).json({ message: "Unauthorized" });
            }

            const service = await ServiceSvc.updateService(id, ownerId, value);
            return res.status(200).json({ message: "Service updated successfully", service });
        } catch (error: any) {
            const status = error.message.includes("Unauthorized") ? 403 : 400;
            return res.status(status).json({ message: error.message || error });
        }
    }

    // DELETE SERVICE
    static async deleteService(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const ownerId = (req as any).user?.userId;
            if (!ownerId) {
                return res.status(401).json({ message: "Unauthorized" });
            }

            await ServiceSvc.deleteService(id, ownerId);
            return res.status(200).json({ message: "Service deleted successfully" });
        } catch (error: any) {
            const status = error.message.includes("Unauthorized") ? 403 : 400;
            return res.status(status).json({ message: error.message || error });
        }
    }

    // IMAGE MANAGEMENT METHODS
    static async uploadServiceImages(req: Request, res: Response) {
        try {
            const ownerId = (req as any).user?.userId;
            const { id } = req.params; // serviceId
            const files = req.files as Express.Multer.File[];

            if (!ownerId) {
                return res.status(401).json({ message: "Unauthorized" });
            }

            if (!files || files.length === 0) {
                return res.status(400).json({ message: "No images uploaded" });
            }
            const images = await ServiceSvc.uploadServiceImages(String(id), String(ownerId), files);
            return res.status(201).json({ success: true, data: images });
        } catch (error: any) {
            return res.status(400).json({
                message: error.message || "Failed to upload images",
                error: typeof error === "object" ? error : String(error),
            });
        }
    }

    static async updateServiceImage(req: Request, res: Response) {
        try {
            const ownerId = (req as any).user?.userId;
            const { imageId } = req.params;
            const data = req.body;

            if (!ownerId) return res.status(401).json({ message: "Unauthorized" });

            const image = await ServiceSvc.updateImage(ownerId, imageId, data);
            return res.status(200).json({ success: true, data: image });
        } catch (error: any) {
            const status = error.message.includes("Unauthorized") ? 403 : 400;
            return res.status(status).json({ message: error.message || error });
        }
    }

    static async deleteServiceImage(req: Request, res: Response) {
        try {
            const ownerId = (req as any).user?.userId;
            const { imageId } = req.params;

            if (!ownerId) return res.status(401).json({ message: "Unauthorized" });

            await ServiceSvc.deleteImage(ownerId, imageId);
            return res.status(200).json({ success: true, message: "Image deleted successfully" });
        } catch (error: any) {
            const status = error.message.includes("Unauthorized") ? 403 : 400;
            return res.status(status).json({ message: error.message || error });
        }
    }
}
