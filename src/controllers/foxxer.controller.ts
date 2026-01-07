import { Request, Response } from "express";
import Joi from "joi";
import FoxxerSvc from "../services/foxxer.service";

export default class FoxxerController {
    // CATEGORIES
    static async createCategory(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                name: Joi.string().required(),
                slug: Joi.string().required(),
                iconUrl: Joi.string().uri().optional(),
            });

            const { error, value } = schema.validate(req.body);
            if (error) return res.status(400).json({ message: error.message });

            const category = await FoxxerSvc.createCategory(value);
            return res.status(201).json({ success: true, data: category });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    static async getAllCategories(req: Request, res: Response) {
        try {
            const categories = await FoxxerSvc.getAllCategories();
            return res.status(200).json({ success: true, data: categories });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    // PROFILE
    static async upsertProfile(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                userId: Joi.string().uuid().required(),
                bio: Joi.string().optional(),
                skills: Joi.string().optional(),
                isAvailable: Joi.boolean().optional(),
            });

            const { error, value } = schema.validate(req.body);
            if (error) return res.status(400).json({ message: error.message });

            const { userId, ...data } = value;
            const profile = await FoxxerSvc.upsertFoxxerProfile(userId, data);
            return res.status(200).json({ success: true, data: profile });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    // SERVICES
    static async createService(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                foxxerId: Joi.string().uuid().required(),
                listingId: Joi.string().uuid().required(),
                categoryId: Joi.string().uuid().required(),
                serviceName: Joi.string().required(),
                serviceDescription: Joi.string().optional(),
                price: Joi.number().required(),
            });

            const { error, value } = schema.validate(req.body);
            if (error) return res.status(400).json({ message: error.message });

            const service = await FoxxerSvc.createListingService(value);
            return res.status(201).json({ success: true, data: service });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    static async getListingServices(req: Request, res: Response) {
        try {
            const { listingId } = req.params;
            const services = await FoxxerSvc.getServicesByListing(listingId);
            return res.status(200).json({ success: true, data: services });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }
}
