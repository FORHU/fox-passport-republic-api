import { Request, Response } from "express";
import { prisma } from "../utils/prisma";
import {
  RequestStatus,
  VenueStatus,
  AssetStatus,
  ServiceStatus,
} from "@prisma/client";
import EventRequestRepo from "../repositories/event-request.repository";
import VenueRepo from "../repositories/venue.repository";
import AssetRepo from "../repositories/asset.repository";
import ServiceRepo from "../repositories/service.repository";
import RefundSvc from "../services/refund.service";
import Joi from "joi";

export default class AdminCtrl {
  // ─── DISPUTES ────────────────────────────────────────────────────────────

  static async getDisputes(req: Request, res: Response) {
    try {
      const refunds = await prisma.refund.findMany({
        where: { status: { in: ["failed", "pending"] } },
        include: {
          booking: {
            include: {
              user: { select: { id: true, name: true, email: true } },
              event: { select: { id: true, name: true, startAt: true } },
            },
          },
          payment: true,
        },
        orderBy: { createdAt: "desc" },
      });

      const disputes = refunds.map((r) => ({
        id: r.id,
        bookingId: r.bookingId,
        bookingType: "event" as const,
        reason: r.failureReason || "Refund failed",
        description: r.adminNotes || undefined,
        status: (r.status === "failed" ? "refund_failed" : r.status) as any,
        createdAt: r.createdAt.toISOString(),
        resolvedAt: r.resolvedAt?.toISOString(),
        resolvedBy: r.resolvedBy || undefined,
        adminNotes: r.adminNotes || undefined,
        citizen: {
          id: r.booking.user?.id ?? "",
          name: r.booking.user?.name ?? "Unknown",
          email: r.booking.user?.email ?? "",
        },
        booking: {
          totalAmount: r.booking.totalAmount,
          status: r.booking.status,
          startAt: r.booking.startAt?.toISOString(),
          event: r.booking.event ? { name: r.booking.event.name } : undefined,
        },
        refunds: r.payment
          ? [
              {
                id: r.id,
                bookingId: r.bookingId,
                amount: r.amount,
                status: r.status,
                method: "stripe",
                createdAt: r.createdAt.toISOString(),
              },
            ]
          : [],
      }));

      return res.status(200).json({ success: true, data: disputes });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getAllRefunds(req: Request, res: Response) {
    try {
      const refunds = await prisma.refund.findMany({
        include: {
          booking: { select: { id: true, totalAmount: true } },
          payment: { select: { method: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      const mapped = refunds.map((r) => ({
        id: r.id,
        bookingId: r.bookingId,
        amount: r.amount,
        status: r.status,
        method: r.payment?.method ?? "stripe",
        failureReason: r.failureReason || undefined,
        adminNotes: r.adminNotes || undefined,
        createdAt: r.createdAt.toISOString(),
        processedAt: r.resolvedAt?.toISOString(),
      }));

      return res.status(200).json({ success: true, data: mapped });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static async resolveDispute(req: Request, res: Response) {
    try {
      const schema = Joi.object({
        action: Joi.string().valid("approve", "reject").required(),
        adminNotes: Joi.string().optional(),
      });
      const { error, value } = schema.validate(req.body);
      if (error) return res.status(400).json({ message: error.message });

      if (value.action === "approve") {
        const updated = await RefundSvc.retryRefund(
          req.params.id,
          req.user!.userId,
        );
        return res.status(200).json({ success: true, data: updated });
      }

      const updated = await prisma.refund.update({
        where: { id: req.params.id },
        data: {
          status: "succeeded",
          resolved: true,
          resolvedBy: req.user!.userId,
          resolvedAt: new Date(),
          adminNotes: value.adminNotes || "Rejected by admin",
        },
      });
      return res.status(200).json({ success: true, data: updated });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  static async manualRefund(req: Request, res: Response) {
    try {
      const schema = Joi.object({
        bookingId: Joi.string().required(),
        amount: Joi.number().min(0).required(),
        reason: Joi.string().required(),
      });
      const { error, value } = schema.validate(req.body);
      if (error) return res.status(400).json({ message: error.message });

      const refund = await prisma.refund.create({
        data: {
          bookingId: value.bookingId,
          amount: value.amount,
          currency: "PHP",
          status: "succeeded",
          initiatedBy: req.user!.userId,
          adminNotes: value.reason,
          resolved: true,
          resolvedBy: req.user!.userId,
          resolvedAt: new Date(),
        },
      });
      return res.status(201).json({ success: true, data: refund });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  // STATS
  static async getStats(req: Request, res: Response) {
    try {
      const [
        totalUsers,
        totalVenues,
        totalEventTemplates,
        pendingRoleRequests,
        bookings,
        serviceBookings,
        assetBookings,
        categoryGroups,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.venue.count(),
        prisma.eventTemplate.count(),
        prisma.roleRequest.count({ where: { status: RequestStatus.pending } }),
        prisma.booking.findMany({
          where: { status: { not: "cancelled" as any } },
          select: {
            totalAmount: true,
            createdAt: true,
            event: { select: { eventCategory: true } },
          },
        }),
        prisma.serviceBooking.aggregate({ _sum: { totalAmount: true } }),
        prisma.assetBooking.aggregate({ _sum: { totalAmount: true } }),
        prisma.event.groupBy({ by: ["eventCategory"], _count: { id: true } }),
      ]);

      const eventRevenue = bookings.reduce(
        (sum, b) => sum + (b.totalAmount ?? 0),
        0,
      );
      const serviceRevenue = serviceBookings._sum.totalAmount ?? 0;
      const assetRevenue = assetBookings._sum.totalAmount ?? 0;
      const totalRevenue = eventRevenue + serviceRevenue + assetRevenue;
      const totalBookings = bookings.length;

      // Bookings per day-of-week (0=Sun … 6=Sat), last 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const recentBookings = bookings.filter(
        (b) => new Date(b.createdAt) >= thirtyDaysAgo,
      );
      const bookingsByDay = [0, 0, 0, 0, 0, 0, 0]; // Sun-Sat
      recentBookings.forEach((b) => {
        bookingsByDay[new Date(b.createdAt).getDay()]++;
      });

      const categoryStats = categoryGroups.map((g) => ({
        category: g.eventCategory,
        count: g._count.id,
      }));

      return res.status(200).json({
        success: true,
        data: {
          totalUsers,
          totalVenues,
          activeEvents: totalEventTemplates,
          pendingApprovals: pendingRoleRequests,
          totalRevenue,
          totalBookings,
          bookingsByDay,
          categoryStats,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  // ─── VENUES ───────────────────────────────────────────────────────────────

  static async getAllVenues(req: Request, res: Response) {
    try {
      const venues = await VenueRepo.findAllVenuesAdmin();
      return res.status(200).json({ success: true, data: venues });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getPendingVenues(req: Request, res: Response) {
    try {
      const venues = await VenueRepo.findAllVenuesAdmin({
        status: VenueStatus.pending,
      });
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
      const assets = await AssetRepo.findAllAssetsAdmin({
        status: AssetStatus.pending,
      });
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

  static async getAllAssets(req: Request, res: Response) {
    try {
      const assets = await AssetRepo.findAllAssetsAdmin({});
      return res.status(200).json({ success: true, data: assets });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  // ─── SERVICES ─────────────────────────────────────────────────────────────

  static async getPendingServices(req: Request, res: Response) {
    try {
      const services = await ServiceRepo.getAllServicesAdmin({
        status: ServiceStatus.pending,
      });
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

  static async getAllServices(req: Request, res: Response) {
    try {
      const services = await ServiceRepo.getAllServicesAdmin({});
      return res.status(200).json({ success: true, data: services });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
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
      const events = await EventRequestRepo.findAllAdmin({
        requestStatus: "pending",
      });
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
      const event = await EventRequestRepo.updateRequestStatus(
        req.params.id,
        "approved",
      );
      // Make the parent template publicly discoverable (skip for template-less events)
      if (event.templateId) {
        await prisma.eventTemplate.update({
          where: { id: event.templateId },
          data: { isPublic: true },
        });
      }
      return res.status(200).json({ success: true, data: event });
    } catch (error: any) {
      return res.status(404).json({ success: false, message: error.message });
    }
  }

  static async rejectEvent(req: Request, res: Response) {
    try {
      const event = await EventRequestRepo.updateRequestStatus(
        req.params.id,
        "rejected",
      );
      // Hide the template if no other approved events remain for it (skip for template-less events)
      if (event.templateId) {
        const approvedCount = await prisma.event.count({
          where: { templateId: event.templateId, requestStatus: "approved" },
        });
        if (approvedCount === 0) {
          await prisma.eventTemplate.update({
            where: { id: event.templateId },
            data: { isPublic: false },
          });
        }
      }
      return res.status(200).json({ success: true, data: event });
    } catch (error: any) {
      return res.status(404).json({ success: false, message: error.message });
    }
  }

  // ─── REFUNDS ─────────────────────────────────────────────────────────────

  static async getFailedRefunds(req: Request, res: Response) {
    try {
      const refunds = await RefundSvc.getFailedRefunds();
      return res.status(200).json({ success: true, data: refunds });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getRefundFailureReason(req: Request, res: Response) {
    try {
      const result = await RefundSvc.getFailureReason(req.params.id);
      return res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  static async retryRefund(req: Request, res: Response) {
    try {
      const result = await RefundSvc.retryRefund(
        req.params.id,
        req.user!.userId,
      );
      return res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  static async resolveManualRefund(req: Request, res: Response) {
    try {
      const schema = Joi.object({
        notes: Joi.string().required(),
      });
      const { error, value } = schema.validate(req.body);
      if (error) return res.status(400).json({ message: error.message });

      const result = await RefundSvc.resolveManual(
        req.params.id,
        req.user!.userId,
        value.notes,
      );
      return res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }
}
