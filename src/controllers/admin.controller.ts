import { Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { RequestStatus, VenueStatus, AssetStatus, ServiceStatus } from "@prisma/client";
import EventRequestRepo from "../repositories/event-request.repository";
import VenueRepo from "../repositories/venue.repository";
import AssetRepo from "../repositories/asset.repository";
import ServiceRepo from "../repositories/service.repository";

export default class AdminCtrl {
  // STATS
  static async getStats(req: Request, res: Response) {
    try {
      const [
        totalUsers,
        totalVenues,
        totalEventTemplates,
        pendingRoleRequests,
        totalRoleRequests,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.venue.count(),
        prisma.eventTemplate.count(),
        prisma.roleRequest.count({ where: { status: RequestStatus.pending } }),
        prisma.roleRequest.count(),
      ]);

      return res.status(200).json({
        success: true,
        data: {
          totalUsers,
          totalVenues,
          activeEvents: totalEventTemplates,
          pendingRoleRequests,
          totalRoleRequests,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  // ─── VENUES ───────────────────────────────────────────────────────────────

  static async getPendingVenues(req: Request, res: Response) {
    try {
      const venues = await VenueRepo.findAllVenuesAdmin({ status: VenueStatus.pending });
      return res.status(200).json({ success: true, data: venues });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static async approveVenue(req: Request, res: Response) {
    try {
      const venue = await prisma.venue.update({
        where: { id: req.params.id },
        data: { status: VenueStatus.available },
      });
      return res.status(200).json({ success: true, data: venue });
    } catch (error: any) {
      return res.status(404).json({ success: false, message: error.message });
    }
  }

  static async rejectVenue(req: Request, res: Response) {
    try {
      const venue = await prisma.venue.update({
        where: { id: req.params.id },
        data: { status: VenueStatus.archived },
      });
      return res.status(200).json({ success: true, data: venue });
    } catch (error: any) {
      return res.status(404).json({ success: false, message: error.message });
    }
  }

  // ─── ASSETS ───────────────────────────────────────────────────────────────

  static async getPendingAssets(req: Request, res: Response) {
    try {
      const assets = await AssetRepo.findAllAssetsAdmin({ status: AssetStatus.pending });
      return res.status(200).json({ success: true, data: assets });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static async approveAsset(req: Request, res: Response) {
    try {
      const asset = await prisma.asset.update({
        where: { id: req.params.id },
        data: { status: AssetStatus.available },
      });
      return res.status(200).json({ success: true, data: asset });
    } catch (error: any) {
      return res.status(404).json({ success: false, message: error.message });
    }
  }

  static async rejectAsset(req: Request, res: Response) {
    try {
      const asset = await prisma.asset.update({
        where: { id: req.params.id },
        data: { status: AssetStatus.rejected },
      });
      return res.status(200).json({ success: true, data: asset });
    } catch (error: any) {
      return res.status(404).json({ success: false, message: error.message });
    }
  }

  // ─── SERVICES ─────────────────────────────────────────────────────────────

  static async getPendingServices(req: Request, res: Response) {
    try {
      const services = await ServiceRepo.getAllServicesAdmin({ status: ServiceStatus.pending });
      return res.status(200).json({ success: true, data: services });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static async approveService(req: Request, res: Response) {
    try {
      const service = await prisma.service.update({
        where: { id: req.params.id },
        data: { status: ServiceStatus.available },
      });
      return res.status(200).json({ success: true, data: service });
    } catch (error: any) {
      return res.status(404).json({ success: false, message: error.message });
    }
  }

  static async rejectService(req: Request, res: Response) {
    try {
      const service = await prisma.service.update({
        where: { id: req.params.id },
        data: { status: ServiceStatus.rejected },
      });
      return res.status(200).json({ success: true, data: service });
    } catch (error: any) {
      return res.status(404).json({ success: false, message: error.message });
    }
  }

  // ─── EVENT TEMPLATES ──────────────────────────────────────────────────────

  static async getAllEventTemplates(req: Request, res: Response) {
    try {
      const templates = await prisma.eventTemplate.findMany({
        include: {
          owner: { select: { id: true, name: true, email: true } },
          images: true,
        },
        orderBy: { createdAt: "desc" },
      });
      return res.status(200).json({ success: true, data: templates });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static async approveEventTemplate(req: Request, res: Response) {
    try {
      const template = await prisma.eventTemplate.update({
        where: { id: req.params.id },
        data: { isPublic: true },
      });
      return res.status(200).json({ success: true, data: template });
    } catch (error: any) {
      return res.status(404).json({ success: false, message: error.message });
    }
  }

  static async rejectEventTemplate(req: Request, res: Response) {
    try {
      const template = await prisma.eventTemplate.update({
        where: { id: req.params.id },
        data: { isPublic: false },
      });
      return res.status(200).json({ success: true, data: template });
    } catch (error: any) {
      return res.status(404).json({ success: false, message: error.message });
    }
  }

  // ─── EVENTS ───────────────────────────────────────────────────────────────

  static async getPendingEvents(req: Request, res: Response) {
    try {
      const events = await EventRequestRepo.findAllAdmin({ requestStatus: "pending" });
      return res.status(200).json({ success: true, data: events });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getAllEvents(req: Request, res: Response) {
    try {
      const { requestStatus } = req.query;
      const events = await EventRequestRepo.findAllAdmin({
        requestStatus: requestStatus as string | undefined,
      });
      return res.status(200).json({ success: true, data: events });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static async approveEvent(req: Request, res: Response) {
    try {
      const event = await EventRequestRepo.updateRequestStatus(req.params.id, "approved");
      // Make the parent template publicly discoverable
      await prisma.eventTemplate.update({
        where: { id: event.templateId },
        data: { isPublic: true },
      });
      return res.status(200).json({ success: true, data: event });
    } catch (error: any) {
      return res.status(404).json({ success: false, message: error.message });
    }
  }

  static async rejectEvent(req: Request, res: Response) {
    try {
      const event = await EventRequestRepo.updateRequestStatus(req.params.id, "rejected");
      // Hide the template if no other approved events remain for it
      const approvedCount = await prisma.event.count({
        where: { templateId: event.templateId, requestStatus: "approved" },
      });
      if (approvedCount === 0) {
        await prisma.eventTemplate.update({
          where: { id: event.templateId },
          data: { isPublic: false },
        });
      }
      return res.status(200).json({ success: true, data: event });
    } catch (error: any) {
      return res.status(404).json({ success: false, message: error.message });
    }
  }
}
