import { Request, Response } from "express";
import Joi from "joi";
import EventTemplateSvc from "../services/event-template.service";
import { EventCategory } from "@prisma/client";

export default class EventTemplateCtrl {
  static async createTemplate(req: Request, res: Response) {
    const schema = Joi.object({
      name: Joi.string().required(),
      description: Joi.string().required(),
      category: Joi.string().valid(...Object.values(EventCategory)).required(),
      isPublic: Joi.boolean().optional(),
      imgIds: Joi.array().items(Joi.string().uuid()).max(5).optional(),
      targetCity: Joi.string().optional(),
      targetState: Joi.string().optional(),
      targetCountry: Joi.string().optional(),
    });

    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ message: error.message });

    try {
      const ownerId = (req as any).user?.userId;
      const template = await EventTemplateSvc.createTemplate({
        ownerId,
        ...value,
      });
      return res.status(201).json({ message: "Template created successfully", template });
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
  }

  static async updateTemplate(req: Request, res: Response) {
    const schema = Joi.object({
      name: Joi.string().optional(),
      description: Joi.string().optional(),
      category: Joi.string().valid(...Object.values(EventCategory)).optional(),
      isPublic: Joi.boolean().optional(),
      imgIds: Joi.array().items(Joi.string().uuid()).max(5).optional(),
    });

    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ message: error.message });

    try {
      const ownerId = (req as any).user?.userId;
      const template = await EventTemplateSvc.updateTemplate({
        id: req.params.id,
        ownerId,
        data: value,
      });
      return res.status(200).json({ message: "Template updated successfully", template });
    } catch (error: any) {
      return res.status(error.message.includes("Unauthorized") ? 403 : 400).json({ message: error.message });
    }
  }

  static async getTemplates(req: Request, res: Response) {
    try {
      const { ownerId, isPublic } = req.query;
      const templates = await EventTemplateSvc.getTemplates({
        ownerId: ownerId as string,
        isPublic: isPublic === "true" ? true : isPublic === "false" ? false : undefined,
      });
      return res.status(200).json({ templates });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  }

  static async getTemplateById(req: Request, res: Response) {
    try {
      const template = await EventTemplateSvc.getTemplateById(req.params.id);
      return res.status(200).json({ template });
    } catch (error: any) {
      return res.status(404).json({ message: error.message });
    }
  }

  static async attachAsset(req: Request, res: Response) {
    const schema = Joi.object({
      assetId: Joi.string().optional(),
      quantity: Joi.number().integer().min(1).optional(),
      description: Joi.string().optional(),
      matchedAt: Joi.date().optional(),
      date: Joi.date().optional()
    }).or("assetId", "description");

    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ message: error.message });

    try {
      const ownerId = (req as any).user?.userId;
      const result = await EventTemplateSvc.attachAsset(
        req.params.id, 
        ownerId, 
        value.assetId, 
        value.quantity, 
        value.description, 
        value.matchedAt, 
        value.date
      );
      return res.status(200).json({ message: "Asset attached", result });
    } catch (error: any) {
      return res.status(error.message.includes("Unauthorized") ? 403 : 400).json({ message: error.message });
    }
  }

  static async removeAsset(req: Request, res: Response) {
    try {
      const ownerId = (req as any).user?.userId;
      const result = await EventTemplateSvc.removeAsset(req.params.id, ownerId, req.params.assetId);
      return res.status(200).json(result);
    } catch (error: any) {
      return res.status(error.message.includes("Unauthorized") ? 403 : 400).json({ message: error.message });
    }
  }

  static async attachService(req: Request, res: Response) {
    const schema = Joi.object({
      serviceId: Joi.string().optional(),
      description: Joi.string().optional(),
      matchedAt: Joi.date().optional(),
      date: Joi.date().optional()
    }).or("serviceId", "description");

    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ message: error.message });

    try {
      const ownerId = (req as any).user?.userId;
      const result = await EventTemplateSvc.attachService(
        req.params.id, 
        ownerId, 
        value.serviceId, 
        value.description, 
        value.matchedAt, 
        value.date
      );
      return res.status(200).json({ message: "Service attached", result });
    } catch (error: any) {
      return res.status(error.message.includes("Unauthorized") ? 403 : 400).json({ message: error.message });
    }
  }

  static async removeService(req: Request, res: Response) {
    try {
      const ownerId = (req as any).user?.userId;
      const result = await EventTemplateSvc.removeService(req.params.id, ownerId, req.params.serviceId);
      return res.status(200).json(result);
    } catch (error: any) {
      return res.status(error.message.includes("Unauthorized") ? 403 : 400).json({ message: error.message });
    }
  }

  static async attachVenue(req: Request, res: Response) {
    const schema = Joi.object({
      venueId: Joi.string().optional(),
      description: Joi.string().optional(),
      matchedAt: Joi.date().optional(),
      date: Joi.date().optional()
    }).or("venueId", "description");

    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ message: error.message });

    try {
      const ownerId = (req as any).user?.userId;
      const result = await EventTemplateSvc.attachVenue(
        req.params.id, 
        ownerId, 
        value.venueId, 
        value.description, 
        value.matchedAt, 
        value.date
      );
      return res.status(200).json({ message: "Venue attached", result });
    } catch (error: any) {
      return res.status(error.message.includes("Unauthorized") ? 403 : 400).json({ message: error.message });
    }
  }

  static async removeVenue(req: Request, res: Response) {
    try {
      const ownerId = (req as any).user?.userId;
      const result = await EventTemplateSvc.removeVenue(req.params.id, ownerId, req.params.venueId);
      return res.status(200).json(result);
    } catch (error: any) {
      return res.status(error.message.includes("Unauthorized") ? 403 : 400).json({ message: error.message });
    }
  }

  static async deleteTemplate(req: Request, res: Response) {
    try {
      const ownerId = (req as any).user?.userId;
      const result = await EventTemplateSvc.deleteTemplate(req.params.id, ownerId);
      return res.status(200).json(result);
    } catch (error: any) {
      return res.status(error.message.includes("Unauthorized") ? 403 : 400).json({ message: error.message });
    }
  }

  static async matchSearch(req: Request, res: Response) {
    try {
      const { templateId, type, scope, category } = req.query;
      const results = await EventTemplateSvc.matchSearch({
        templateId: templateId as string,
        type: type as string,
        scope: (scope as string) || "state",
        category: category as string
      });
      return res.status(200).json(results);
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
  }

  static async matchItem(req: Request, res: Response) {
    const schema = Joi.object({
      itemId: Joi.string().required(),
      type: Joi.string().valid("asset", "service", "venue").required(),
      providerId: Joi.string().required(),
      forceMatch: Joi.boolean().optional(),
      description: Joi.string().optional(),
      matchedAt: Joi.date().optional(),
      date: Joi.date().optional()
    });

    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ message: error.message });

    try {
      const ownerId = (req as any).user?.userId;
      const result = await EventTemplateSvc.matchItem({
        templateId: req.params.id,
        ownerId,
        ...value
      });
      return res.status(200).json({ message: "Item matched successfully", result });
    } catch (error: any) {
      return res.status(error.message.includes("Unauthorized") ? 403 : 400).json({ message: error.message });
    }
  }
}
