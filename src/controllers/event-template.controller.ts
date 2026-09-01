import { Request, Response } from "express";
import Joi from "joi";
import { prisma } from "../utils/prisma";
import EventTemplateSvc from "../services/event-template.service";
import EventTemplateRepo from "../repositories/event-template.repository";
import { sendApprovedEmail } from "../utils/emails/approved";
import { sendRejectedEmail } from "../utils/emails/rejected";
import { EventCategory, EventTemplateStatus } from "@prisma/client";
import {
  announceAdminQueueChanged,
  announceToUser,
} from "../infrastructure/socket/invalidate";
import { can } from "../types/permissions";

export default class EventTemplateCtrl {
  static async createTemplate(req: Request, res: Response) {
    const schema = Joi.object({
      name: Joi.string().required(),
      description: Joi.string().optional(),
      category: Joi.string()
        .valid(...Object.values(EventCategory))
        .required(),
      isPublic: Joi.boolean().optional(),
      imgIds: Joi.array().items(Joi.string().uuid()).max(5).optional(),
      targetCity: Joi.string().optional(),
      targetState: Joi.string().optional(),
      targetCountry: Joi.string().optional(),
      lat: Joi.number().optional(),
      lng: Joi.number().optional(),
      hostMarkupPct: Joi.number().min(0).max(100).optional(),
      maxAttendees: Joi.number().integer().min(1).optional(),
      cancellationPolicyId: Joi.string().uuid().optional(),
    });

    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ message: error.message });

    try {
      const ownerId = req.user?.userId;
      if (!ownerId) return res.status(401).json({ message: "Unauthorized" });
      const template = await EventTemplateSvc.createTemplate({
        ownerId,
        ...value,
      });
      announceAdminQueueChanged();
      return res
        .status(201)
        .json({ message: "Template created successfully", template });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(400).json({ message: error.message });
    }
  }

  static async updateTemplate(req: Request, res: Response) {
    const schema = Joi.object({
      name: Joi.string().optional(),
      description: Joi.string().optional(),
      category: Joi.string()
        .valid(...Object.values(EventCategory))
        .optional(),
      isPublic: Joi.boolean().optional(),
      imgIds: Joi.array().items(Joi.string().uuid()).max(5).optional(),
      targetCity: Joi.string().optional(),
      targetState: Joi.string().optional(),
      targetCountry: Joi.string().optional(),
      lat: Joi.number().optional(),
      lng: Joi.number().optional(),
      hostMarkupPct: Joi.number().min(0).max(100).optional(),
      maxAttendees: Joi.number().integer().min(1).allow(null).optional(),
      cancellationPolicyId: Joi.string().uuid().optional(),
    });

    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ message: error.message });

    try {
      const ownerId = req.user?.userId;
      if (!ownerId) return res.status(401).json({ message: "Unauthorized" });
      const template = await EventTemplateSvc.updateTemplate({
        id: req.params.id,
        ownerId,
        data: value,
      });
      announceAdminQueueChanged();
      return res
        .status(200)
        .json({ message: "Template updated successfully", template });
    } catch (e: unknown) {
      const error = e as Error;
      const status = error.message.includes("Unauthorized")
        ? 403
        : error.message.includes("not found")
          ? 404
          : 400;
      return res.status(status).json({ message: error.message });
    }
  }

  static async getTrending(req: Request, res: Response) {
    try {
      const { category, limit } = req.query;
      if (!category)
        return res.status(400).json({ message: "category is required" });
      const templates = await EventTemplateRepo.findTrendingByCategory(
        category as string,
        limit ? parseInt(limit as string, 10) : 4,
      );
      return res.status(200).json({ templates });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(500).json({ message: error.message });
    }
  }

  static async getTemplates(req: Request, res: Response) {
    try {
      const { ownerId, isPublic, category, city, targetCity, page, limit } =
        req.query;
      const { templates, total } = await EventTemplateSvc.getTemplates({
        ownerId: ownerId as string,
        isPublic:
          isPublic === "true" ? true : isPublic === "false" ? false : undefined,
        category: category as string | undefined,
        city: (city ?? targetCity) as string | undefined,
        page: page ? Number(page) : undefined,
        limit: limit ? Math.min(Number(limit), 50) : undefined,
      });
      return res.status(200).json({ templates, total });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(500).json({ message: error.message });
    }
  }

  // Public — no auth required, searchable browse for the public /search page
  static async browsePublic(req: Request, res: Response) {
    try {
      const { category, targetCity, city, maxPrice, isPublic, page, limit } =
        req.query;
      const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
      const limitNum = limit ? Math.min(Number(limit), 50) : 50;

      const result = await EventTemplateSvc.getPublicTemplatesLite({
        category: category as string | undefined,
        targetCity: targetCity as string | undefined,
        city: city as string | undefined,
        maxPrice: maxPrice ? Number(maxPrice) : undefined,
        isPublic:
          isPublic === "false" ? false : isPublic === "true" ? true : undefined,
        page: pageNum,
        limit: limitNum,
      });
      return res.status(200).json({
        success: true,
        data: result.templates,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: result.total,
          totalPages: Math.ceil(result.total / limitNum),
        },
      });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(500).json({ message: error.message });
    }
  }

  // Public single template by ID — no auth required
  static async browsePublicById(req: Request, res: Response) {
    try {
      const template = await EventTemplateSvc.getTemplateById(req.params.id);
      if (!template.isPublic) {
        return res.status(404).json({ message: "Template not found" });
      }
      return res.status(200).json({ success: true, data: template });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(404).json({ message: error.message });
    }
  }

  static async getTemplateById(req: Request, res: Response) {
    try {
      const template = await EventTemplateSvc.getTemplateById(req.params.id);
      return res.status(200).json({ template });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(404).json({ message: error.message });
    }
  }

  static async attachAsset(req: Request, res: Response) {
    const schema = Joi.object({
      assetId: Joi.string().optional(),
      quantity: Joi.number().integer().min(1).optional(),
      description: Joi.string().optional(),
      matchedAt: Joi.date().optional(),
      date: Joi.date().optional(),
      agreedPrice: Joi.number().min(0).optional(),
      isOptional: Joi.boolean().optional(),
    }).or("assetId", "description");

    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ message: error.message });

    try {
      const ownerId = req.user?.userId;
      if (!ownerId) return res.status(401).json({ message: "Unauthorized" });
      const result = await EventTemplateSvc.attachAsset(
        req.params.id,
        ownerId,
        value.assetId,
        value.quantity,
        value.description,
        value.matchedAt,
        value.date,
        value.agreedPrice,
        value.isOptional,
      );
      return res.status(200).json({ message: "Asset attached", result });
    } catch (e: unknown) {
      const error = e as Error;
      return res
        .status(error.message.includes("Unauthorized") ? 403 : 400)
        .json({ message: error.message });
    }
  }

  static async removeAsset(req: Request, res: Response) {
    try {
      const ownerId = req.user?.userId;
      if (!ownerId) return res.status(401).json({ message: "Unauthorized" });
      const result = await EventTemplateSvc.removeAsset(
        req.params.id,
        ownerId,
        req.params.assetId,
      );
      return res.status(200).json(result);
    } catch (e: unknown) {
      const error = e as Error;
      return res
        .status(error.message.includes("Unauthorized") ? 403 : 400)
        .json({ message: error.message });
    }
  }

  static async attachService(req: Request, res: Response) {
    const schema = Joi.object({
      serviceId: Joi.string().optional(),
      description: Joi.string().optional(),
      matchedAt: Joi.date().optional(),
      date: Joi.date().optional(),
      agreedPrice: Joi.number().min(0).optional(),
      isOptional: Joi.boolean().optional(),
    }).or("serviceId", "description");

    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ message: error.message });

    try {
      const ownerId = req.user?.userId;
      if (!ownerId) return res.status(401).json({ message: "Unauthorized" });
      const result = await EventTemplateSvc.attachService(
        req.params.id,
        ownerId,
        value.serviceId,
        value.description,
        value.matchedAt,
        value.date,
        value.agreedPrice,
        value.isOptional,
      );
      return res.status(200).json({ message: "Service attached", result });
    } catch (e: unknown) {
      const error = e as Error;
      return res
        .status(error.message.includes("Unauthorized") ? 403 : 400)
        .json({ message: error.message });
    }
  }

  static async removeService(req: Request, res: Response) {
    try {
      const ownerId = req.user?.userId;
      if (!ownerId) return res.status(401).json({ message: "Unauthorized" });
      const result = await EventTemplateSvc.removeService(
        req.params.id,
        ownerId,
        req.params.serviceId,
      );
      return res.status(200).json(result);
    } catch (e: unknown) {
      const error = e as Error;
      return res
        .status(error.message.includes("Unauthorized") ? 403 : 400)
        .json({ message: error.message });
    }
  }

  static async attachVenue(req: Request, res: Response) {
    const schema = Joi.object({
      venueId: Joi.string().optional(),
      description: Joi.string().optional(),
      matchedAt: Joi.date().optional(),
      date: Joi.date().optional(),
      agreedPrice: Joi.number().min(0).optional(),
      isOptional: Joi.boolean().optional(),
    }).or("venueId", "description");

    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ message: error.message });

    try {
      const ownerId = req.user?.userId;
      if (!ownerId) return res.status(401).json({ message: "Unauthorized" });
      const result = await EventTemplateSvc.attachVenue(
        req.params.id,
        ownerId,
        value.venueId,
        value.description,
        value.matchedAt,
        value.date,
        value.agreedPrice,
        value.isOptional,
      );
      return res.status(200).json({ message: "Venue attached", result });
    } catch (e: unknown) {
      const error = e as Error;
      return res
        .status(error.message.includes("Unauthorized") ? 403 : 400)
        .json({ message: error.message });
    }
  }

  static async removeVenue(req: Request, res: Response) {
    try {
      const ownerId = req.user?.userId;
      if (!ownerId) return res.status(401).json({ message: "Unauthorized" });
      const result = await EventTemplateSvc.removeVenue(
        req.params.id,
        ownerId,
        req.params.venueId,
      );
      return res.status(200).json(result);
    } catch (e: unknown) {
      const error = e as Error;
      return res
        .status(error.message.includes("Unauthorized") ? 403 : 400)
        .json({ message: error.message });
    }
  }

  static async submitTemplate(req: Request, res: Response) {
    try {
      const ownerId = req.user?.userId;
      if (!ownerId) return res.status(401).json({ message: "Unauthorized" });
      const template = await EventTemplateSvc.submitTemplate(
        req.params.id,
        ownerId,
      );
      announceAdminQueueChanged();
      return res
        .status(200)
        .json({ message: "Template submitted for review", template });
    } catch (e: unknown) {
      const error = e as Error;
      if (error.message.includes("not found"))
        return res.status(404).json({ message: error.message });
      if (error.message.includes("Unauthorized"))
        return res.status(403).json({ message: error.message });
      return res.status(400).json({ message: error.message });
    }
  }

  static async deleteTemplate(req: Request, res: Response) {
    try {
      const ownerId = req.user?.userId;
      if (!ownerId) return res.status(401).json({ message: "Unauthorized" });
      const result = await EventTemplateSvc.deleteTemplate(
        req.params.id,
        ownerId,
      );
      announceAdminQueueChanged();
      return res.status(200).json(result);
    } catch (e: unknown) {
      const error = e as Error;
      return res
        .status(error.message.includes("Unauthorized") ? 403 : 400)
        .json({ message: error.message });
    }
  }

  static async matchSearch(req: Request, res: Response) {
    try {
      const { templateId, type, scope, category } = req.query;
      const results = await EventTemplateSvc.matchSearch({
        templateId: templateId as string,
        type: type as string,
        scope: (scope as string) || "state",
        category: category as string,
      });
      return res.status(200).json(results);
    } catch (e: unknown) {
      const error = e as Error;
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
      date: Joi.date().optional(),
    });

    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ message: error.message });

    try {
      const ownerId = req.user?.userId;
      if (!ownerId) return res.status(401).json({ message: "Unauthorized" });
      const result = await EventTemplateSvc.matchItem({
        templateId: req.params.id,
        ownerId,
        ...value,
      });
      return res
        .status(200)
        .json({ message: "Item matched successfully", result });
    } catch (e: unknown) {
      const error = e as Error;
      return res
        .status(error.message.includes("Unauthorized") ? 403 : 400)
        .json({ message: error.message });
    }
  }

  static async getOutgoingMatchRequests(req: Request, res: Response) {
    try {
      const ownerId = req.user?.userId;
      if (!ownerId) return res.status(401).json({ message: "Unauthorized" });
      const data = await EventTemplateSvc.getOutgoingMatchRequests(ownerId);
      return res.status(200).json({ success: true, data });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(500).json({ message: error.message });
    }
  }

  static async getIncomingMatchRequests(req: Request, res: Response) {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const data = await EventTemplateSvc.getIncomingMatchRequests(userId);
      return res.status(200).json({ success: true, data });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(500).json({ message: error.message });
    }
  }

  static async respondToMatch(req: Request, res: Response) {
    const schema = Joi.object({
      type: Joi.string().valid("asset", "service", "venue").required(),
      status: Joi.string().valid("accepted", "declined").required(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ message: error.message });

    try {
      const responderId = req.user?.userId;
      if (!responderId)
        return res.status(401).json({ message: "Unauthorized" });
      const result = await EventTemplateSvc.respondToMatch({
        matchId: req.params.matchId,
        responderId,
        ...value,
      });
      return res.status(200).json({ success: true, data: result });
    } catch (e: unknown) {
      const error = e as Error;
      return res
        .status(error.message.includes("unauthorized") ? 403 : 400)
        .json({ message: error.message });
    }
  }

  static async approveEventTemplate(req: Request, res: Response) {
    try {
      const user = req.user;
      if (!user || !can(user.systemRole, "queue:decide")) {
        return res
          .status(403)
          .json({ message: "Forbidden: Admin access required" });
      }
      const template = await prisma.eventTemplate.update({
        where: { id: req.params.id },
        data: { status: EventTemplateStatus.published },
      });

      try {
        const full = await prisma.eventTemplate.findUnique({
          where: { id: template.id },
          include: { owner: { select: { email: true, name: true } } },
        });
        if (full?.owner?.email) {
          sendApprovedEmail({
            to: full.owner.email,
            entityName: full.name,
            entityType: "Event Template",
          });
        }
      } catch (emailErr) {
        console.error("Failed to send approval email:", emailErr);
      }

      announceAdminQueueChanged();
      announceToUser(template.ownerId, "events");
      return res
        .status(200)
        .json({ message: "Event template approved successfully", template });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(404).json({ message: error.message || error });
    }
  }

  static async getRecommendations(req: Request, res: Response) {
    try {
      const templates = await prisma.eventTemplate.findMany({
        where: { isPublic: true, status: EventTemplateStatus.published },
        orderBy: { createdAt: "desc" },
        take: 6,
        include: {
          images: { take: 1, select: { url: true } },
        },
      });
      const data = templates.map((t) => ({
        id: t.id,
        title: t.name,
        category: t.category,
        match: Math.floor(Math.random() * 20) + 80,
        image: t.images?.[0]?.url ?? null,
        location:
          [t.targetCity, t.targetCountry].filter(Boolean).join(", ") || null,
      }));
      return res.status(200).json({ success: true, data });
    } catch (e: unknown) {
      const err = e as Error;
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  static async rejectEventTemplate(req: Request, res: Response) {
    try {
      const user = req.user;
      if (!user || !can(user.systemRole, "queue:decide")) {
        return res
          .status(403)
          .json({ message: "Forbidden: Admin access required" });
      }
      const { reason } = req.body;
      if (!reason) {
        return res
          .status(400)
          .json({ message: "Rejection reason is required" });
      }
      const template = await prisma.eventTemplate.update({
        where: { id: req.params.id },
        data: { status: EventTemplateStatus.rejected, rejectionReason: reason },
      });

      try {
        const full = await prisma.eventTemplate.findUnique({
          where: { id: template.id },
          include: { owner: { select: { email: true, name: true } } },
        });
        if (full?.owner?.email) {
          sendRejectedEmail({
            to: full.owner.email,
            entityName: full.name,
            entityType: "Event Template",
            reason,
          });
        }
      } catch (emailErr) {
        console.error("Failed to send rejection email:", emailErr);
      }

      announceAdminQueueChanged();
      announceToUser(template.ownerId, "events");
      return res
        .status(200)
        .json({ message: "Event template rejected successfully", template });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(404).json({ message: error.message || error });
    }
  }
}
