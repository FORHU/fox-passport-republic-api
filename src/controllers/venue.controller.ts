import { Request, Response } from "express";
import Joi from "joi";
import { prisma } from "../utils/prisma";
import VenueSvc from "../services/venue.service";
import { sendApprovedEmail } from "../utils/emails/approved";
import { sendRejectedEmail } from "../utils/emails/rejected";
import { VenueStatus, VenueCategory } from "@prisma/client";

export default class VenueCtrl {
  // Create Venue Controller
  static async createVenue(req: Request, res: Response) {
    const schema = Joi.object({
      name: Joi.string().required(),
      description: Joi.string().required(),
      category: Joi.string()
        .valid(...Object.values(VenueCategory))
        .required(),
      capacity: Joi.number().integer().min(1).required(),
      address: Joi.string().required(),
      city: Joi.string().required(),
      state: Joi.string().optional(),
      country: Joi.string().required(),
      imgIds: Joi.array().items(Joi.string()).min(1).max(5).required(),
      spaceType: Joi.array().items(Joi.string()).optional(),
      amenities: Joi.array().items(Joi.string()).optional(),
      techAv: Joi.array().items(Joi.string()).optional(),
      staffing: Joi.array().items(Joi.string()).optional(),
      policies: Joi.array().items(Joi.string()).optional(),
      status: Joi.string()
        .valid(...Object.values(VenueStatus))
        .optional(),
      price: Joi.number().min(0).optional(),
      billingRate: Joi.string()
        .valid("hourly", "daily", "weekly", "monthly", "yearly", "one_time")
        .default("daily"),
      cancellationPolicyId: Joi.string().uuid().optional(),
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.message });
    }

    try {
      // mayorId comes from the authenticated user's JWT token
      const mayorId = (req as any).user?.userId;
      if (!mayorId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const venueData = { ...value, mayorId };
      const venue = await VenueSvc.createVenue(venueData as any);
      return res
        .status(201)
        .json({ message: "Venue created successfully", venue });
    } catch (error: any) {
      return res.status(400).json({ message: error.message || error });
    }
  }

  // READ Venues Controller with optional query parameters for filtering
  // `hostId` accepted as a deprecated alias for `mayorId` (see venue.repository.ts)
  static async getVenues(req: Request, res: Response) {
    try {
      const mayorId = (req.query.mayorId ?? req.query.hostId) as
        | string
        | undefined;
      const venues = await VenueSvc.getVenues(
        mayorId ? { mayorId } : undefined,
      );
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
      category: Joi.string()
        .valid(...Object.values(VenueCategory))
        .optional(),
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
      status: Joi.string()
        .valid(...Object.values(VenueStatus))
        .optional(),
      billingRate: Joi.string()
        .valid("hourly", "daily", "weekly", "monthly", "yearly", "one_time")
        .optional(),
      cancellationPolicyId: Joi.string().uuid().optional(),
    }).min(1);

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.message });
    }

    try {
      const requesterId = (req as any).user?.userId as string | undefined;
      const requesterRole = (req as any).user?.role as string | undefined;
      if (!requesterId)
        return res.status(401).json({ message: "Unauthorized" });

      const venue = await VenueSvc.updateVenue({
        id: String(req.params.id),
        requesterId,
        data: value as any,
      });
      return res
        .status(200)
        .json({ message: "Venue updated successfully", venue });
    } catch (err: any) {
      const status =
        err.message === "Unauthorized"
          ? 403
          : err.message === "Venue not found"
            ? 404
            : 400;
      return res.status(status).json({ message: err.message || err });
    }
  }

  static async deleteVenue(req: Request, res: Response) {
    try {
      const requesterId = (req as any).user?.userId as string | undefined;
      const requesterRole = (req as any).user?.role as string | undefined;
      if (!requesterId)
        return res.status(401).json({ message: "Unauthorized" });

      await VenueSvc.deleteVenue({
        id: String(req.params.id),
        requesterId,
        requesterRole,
      });
      return res.status(200).json({ message: "Venue deleted successfully" });
    } catch (err: any) {
      const status =
        err.message === "Unauthorized"
          ? 403
          : err.message === "Venue not found"
            ? 404
            : 400;
      return res.status(status).json({ message: err.message || err });
    }
  }

  static async approveVenue(req: Request, res: Response) {
    try {
      const user = (req as any).user;
      if (!user || user.systemRole !== "admin") {
        return res
          .status(403)
          .json({ message: "Forbidden: Admin access required" });
      }
      const venue = await prisma.venue.update({
        where: { id: req.params.id },
        data: { status: VenueStatus.available },
      });

      try {
        const full = await prisma.venue.findUnique({
          where: { id: venue.id },
          include: { mayor: { select: { email: true, name: true } } },
        });
        if (full?.mayor?.email) {
          sendApprovedEmail({
            to: full.mayor.email,
            entityName: full.name,
            entityType: "Venue",
          });
        }
      } catch (emailErr) {
        console.error("Failed to send approval email:", emailErr);
      }

      return res
        .status(200)
        .json({ message: "Venue approved successfully", venue });
    } catch (error: any) {
      return res.status(404).json({ message: error.message || error });
    }
  }

  static async rejectVenue(req: Request, res: Response) {
    try {
      const user = (req as any).user;
      if (!user || user.systemRole !== "admin") {
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
      const venue = await prisma.venue.update({
        where: { id: req.params.id },
        data: { status: VenueStatus.rejected, rejectionReason: reason },
      });

      try {
        const full = await prisma.venue.findUnique({
          where: { id: venue.id },
          include: { mayor: { select: { email: true, name: true } } },
        });
        if (full?.mayor?.email) {
          sendRejectedEmail({
            to: full.mayor.email,
            entityName: full.name,
            entityType: "Venue",
            reason,
          });
        }
      } catch (emailErr) {
        console.error("Failed to send rejection email:", emailErr);
      }

      return res
        .status(200)
        .json({ message: "Venue rejected successfully", venue });
    } catch (error: any) {
      return res.status(404).json({ message: error.message || error });
    }
  }
}
