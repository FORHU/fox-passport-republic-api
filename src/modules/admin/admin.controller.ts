import { Request, Response } from "express";
import AdminSvc from "./admin.service";
import {
  VenueStatus,
  AssetStatus,
  ServiceStatus,
  EventTemplateStatus,
  Prisma,
} from "@prisma/client";
import { toEnum } from "../../utils/enums";
import EventRequestSvc from "../event-request/event-request.service";
import VenueSvc from "../venue/venue.service";
import AssetSvc from "../asset/asset.service";
import ServiceSvc from "../service/service.service";
import RefundSvc from "../refund/refund.service";
import Joi from "joi";
import RoleAssignmentSvc, {
  RoleAssignmentError,
} from "./role-assignment.service";

export default class AdminCtrl {
  // ─── ROLE ASSIGNMENT ─────────────────────────────────────────────────────

  /**
   * The only endpoints that hand out capability directly. Both announce `roles`
   * to the target, which maps to the shared `["me"]` profile key — the person's
   * own screen updates without waiting for the poll, and since their sessions
   * were just revoked they will be re-authenticating shortly anyway.
   */
  static async changeSystemRole(req: Request, res: Response) {
    const schema = Joi.object({ systemRole: Joi.string().required() });
    const { error, value } = schema.validate(req.body);
    if (error)
      return res.status(400).json({ success: false, message: error.message });

    try {
      const result = await RoleAssignmentSvc.changeSystemRole(
        { userId: req.user!.userId, email: req.user!.email },
        req.params.id,
        value.systemRole,
      );
      return res.status(200).json({ success: true, data: result.target });
    } catch (e: unknown) {
      if (e instanceof RoleAssignmentError) {
        return res
          .status(e.status)
          .json({ success: false, message: e.message, reason: e.reason });
      }
      const err = e as Error;
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  static async changeRoleTypes(req: Request, res: Response) {
    const schema = Joi.object({
      roleType: Joi.array().items(Joi.string()).required(),
    });
    const { error, value } = schema.validate(req.body);
    if (error)
      return res.status(400).json({ success: false, message: error.message });

    try {
      const result = await RoleAssignmentSvc.changeRoleTypes(
        { userId: req.user!.userId, email: req.user!.email },
        req.params.id,
        value.roleType,
      );
      return res.status(200).json({ success: true, data: result.target });
    } catch (e: unknown) {
      if (e instanceof RoleAssignmentError) {
        return res
          .status(e.status)
          .json({ success: false, message: e.message, reason: e.reason });
      }
      const err = e as Error;
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  // ─── DISPUTES ────────────────────────────────────────────────────────────

  static async getDisputes(req: Request, res: Response) {
    try {
      const refunds = await AdminSvc.getDisputes();

      // The dates arrive as ISO strings already: the service caches this read,
      // and a cached value has been through JSON. Calling `toISOString()` on
      // them threw on every cache hit until the helper's return type started
      // saying so.
      const disputes = refunds.map((r) => ({
        id: r.id,
        bookingId: r.bookingId,
        bookingType: "event" as const,
        reason: r.failureReason || "Refund failed",
        description: r.adminNotes || undefined,
        // A failed refund surfaces to admins as its own dispute state.
        status: r.status === "failed" ? ("refund_failed" as const) : r.status,
        createdAt: r.createdAt,
        resolvedAt: r.resolvedAt ?? undefined,
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
          startAt: r.booking.startAt ?? undefined,
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
                createdAt: r.createdAt,
              },
            ]
          : [],
      }));

      return res.status(200).json({ success: true, data: disputes });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getAllRefunds(req: Request, res: Response) {
    try {
      const refunds = await AdminSvc.getAllRefunds();

      const mapped = refunds.map((r) => ({
        id: r.id,
        bookingId: r.bookingId,
        amount: r.amount,
        status: r.status,
        method: r.payment?.method ?? "stripe",
        failureReason: r.failureReason || undefined,
        adminNotes: r.adminNotes || undefined,
        createdAt: r.createdAt,
        processedAt: r.resolvedAt ?? undefined,
      }));

      return res.status(200).json({ success: true, data: mapped });
    } catch (e: unknown) {
      const error = e as Error;
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

      const updated = await AdminSvc.resolveDispute(
        req.params.id,
        value.action,
        req.user!.userId,
        value.adminNotes,
      );
      return res.status(200).json({ success: true, data: updated });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  // ─── ASSET / SERVICE BOOKING DISPUTES ───────────────────────────────────

  static async getAssetBookingDisputes(req: Request, res: Response) {
    try {
      const bookings = await AdminSvc.getAssetBookingDisputes();
      return res.status(200).json({ success: true, data: bookings });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static async resolveAssetBookingDispute(req: Request, res: Response) {
    try {
      const schema = Joi.object({
        resolution: Joi.string().valid("completed", "cancelled").required(),
      });
      const { error, value } = schema.validate(req.body);
      if (error)
        return res.status(400).json({ success: false, message: error.message });

      const booking = await AdminSvc.resolveAssetBookingDispute(
        req.params.id,
        value.resolution,
      );
      return res.status(200).json({ success: true, data: booking });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  static async getServiceBookingDisputes(req: Request, res: Response) {
    try {
      const bookings = await AdminSvc.getServiceBookingDisputes();
      return res.status(200).json({ success: true, data: bookings });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static async resolveServiceBookingDispute(req: Request, res: Response) {
    try {
      const schema = Joi.object({
        resolution: Joi.string().valid("completed", "cancelled").required(),
      });
      const { error, value } = schema.validate(req.body);
      if (error)
        return res.status(400).json({ success: false, message: error.message });

      const booking = await AdminSvc.resolveServiceBookingDispute(
        req.params.id,
        value.resolution,
      );
      return res.status(200).json({ success: true, data: booking });
    } catch (e: unknown) {
      const error = e as Error;
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

      const refund = await AdminSvc.createManualRefund({
        bookingId: value.bookingId,
        amount: value.amount,
        reason: value.reason,
        adminId: req.user!.userId,
      });
      return res.status(201).json({ success: true, data: refund });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  // STATS
  static async getStats(req: Request, res: Response) {
    try {
      const data = await AdminSvc.getStats();
      return res.status(200).json({ success: true, data });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  // ─── VENUES ───────────────────────────────────────────────────────────────

  static async getAllVenues(req: Request, res: Response) {
    try {
      const venues = await VenueSvc.findAllVenuesAdmin();
      return res.status(200).json({ success: true, data: venues });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getPendingVenues(req: Request, res: Response) {
    try {
      const venues = await VenueSvc.findAllVenuesAdmin({
        status: VenueStatus.pending,
      });
      return res.status(200).json({ success: true, data: venues });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static async approveVenue(req: Request, res: Response) {
    try {
      const venue = await AdminSvc.approveVenue(req.params.id);
      return res.status(200).json({ success: true, data: venue });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(404).json({ success: false, message: error.message });
    }
  }

  static async rejectVenue(req: Request, res: Response) {
    try {
      const venue = await AdminSvc.rejectVenue(req.params.id, req.body?.reason);
      return res.status(200).json({ success: true, data: venue });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(404).json({ success: false, message: error.message });
    }
  }

  // ─── ASSETS ───────────────────────────────────────────────────────────────

  static async getPendingAssets(req: Request, res: Response) {
    try {
      const assets = await AssetSvc.findAllAssetsAdmin({
        status: AssetStatus.pending,
      });
      return res.status(200).json({ success: true, data: assets });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static async approveAsset(req: Request, res: Response) {
    try {
      const asset = await AdminSvc.approveAsset(req.params.id);
      return res.status(200).json({ success: true, data: asset });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(404).json({ success: false, message: error.message });
    }
  }

  static async rejectAsset(req: Request, res: Response) {
    try {
      const asset = await AdminSvc.rejectAsset(req.params.id, req.body?.reason);
      return res.status(200).json({ success: true, data: asset });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(404).json({ success: false, message: error.message });
    }
  }

  static async getAllAssets(req: Request, res: Response) {
    try {
      const assets = await AssetSvc.findAllAssetsAdmin({});
      return res.status(200).json({ success: true, data: assets });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  // ─── SERVICES ─────────────────────────────────────────────────────────────

  static async getPendingServices(req: Request, res: Response) {
    try {
      const services = await ServiceSvc.getAllServicesAdmin({
        status: ServiceStatus.pending,
      });
      return res.status(200).json({ success: true, data: services });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static async approveService(req: Request, res: Response) {
    try {
      const service = await AdminSvc.approveService(req.params.id);
      return res.status(200).json({ success: true, data: service });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(404).json({ success: false, message: error.message });
    }
  }

  static async rejectService(req: Request, res: Response) {
    try {
      const service = await AdminSvc.rejectService(
        req.params.id,
        req.body?.reason,
      );
      return res.status(200).json({ success: true, data: service });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(404).json({ success: false, message: error.message });
    }
  }

  static async getAllServices(req: Request, res: Response) {
    try {
      const services = await ServiceSvc.getAllServicesAdmin({});
      return res.status(200).json({ success: true, data: services });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  // ─── EVENT TEMPLATES ──────────────────────────────────────────────────────

  static async getAllEventTemplates(req: Request, res: Response) {
    try {
      const { status } = req.query as { status?: string };
      const templateStatus = toEnum(EventTemplateStatus, status);
      const templates = await AdminSvc.getEventTemplates(templateStatus);
      return res.status(200).json({ success: true, data: templates });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getPendingEventTemplates(req: Request, res: Response) {
    try {
      const templates = await AdminSvc.getEventTemplates(
        EventTemplateStatus.pending,
      );
      return res.status(200).json({ success: true, data: templates });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static async approveEventTemplate(req: Request, res: Response) {
    try {
      const template = await AdminSvc.approveEventTemplate(req.params.id);
      return res.status(200).json({ success: true, data: template });
    } catch (e: unknown) {
      const error = e as Error;
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        return res
          .status(404)
          .json({ success: false, message: "Event template not found" });
      }
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static async rejectEventTemplate(req: Request, res: Response) {
    try {
      const { reason } = req.body;
      if (!reason) {
        return res
          .status(400)
          .json({ success: false, message: "Rejection reason is required" });
      }
      const template = await AdminSvc.rejectEventTemplate(
        req.params.id,
        reason,
      );
      return res.status(200).json({ success: true, data: template });
    } catch (e: unknown) {
      const error = e as Error;
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        return res
          .status(404)
          .json({ success: false, message: "Event template not found" });
      }
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  // ─── EVENTS ───────────────────────────────────────────────────────────────

  static async getPendingEvents(req: Request, res: Response) {
    try {
      const events = await EventRequestSvc.findAllAdmin({
        requestStatus: "pending",
      });
      return res.status(200).json({ success: true, data: events });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getAllEvents(req: Request, res: Response) {
    try {
      const { requestStatus } = req.query;
      const events = await EventRequestSvc.findAllAdmin({
        requestStatus: requestStatus as string | undefined,
      });
      return res.status(200).json({ success: true, data: events });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static async approveEvent(req: Request, res: Response) {
    try {
      const event = await AdminSvc.approveEvent(
        req.params.id,
        req.user!.userId,
        req.user!.systemRole,
      );
      return res.status(200).json({ success: true, data: event });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(404).json({ success: false, message: error.message });
    }
  }

  static async rejectEvent(req: Request, res: Response) {
    try {
      const event = await AdminSvc.rejectEvent(
        req.params.id,
        req.body?.reason,
        req.user!.userId,
        req.user!.systemRole,
      );
      return res.status(200).json({ success: true, data: event });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(404).json({ success: false, message: error.message });
    }
  }

  // ─── REFUNDS ─────────────────────────────────────────────────────────────

  static async getFailedRefunds(req: Request, res: Response) {
    try {
      const refunds = await RefundSvc.getFailedRefunds();
      return res.status(200).json({ success: true, data: refunds });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getRefundFailureReason(req: Request, res: Response) {
    try {
      const result = await RefundSvc.getFailureReason(req.params.id);
      return res.status(200).json({ success: true, data: result });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  static async retryRefund(req: Request, res: Response) {
    try {
      const result = await AdminSvc.retryRefund(
        req.params.id,
        req.user!.userId,
      );
      return res.status(200).json({ success: true, data: result });
    } catch (e: unknown) {
      const error = e as Error;
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

      const result = await AdminSvc.resolveManualRefund(
        req.params.id,
        req.user!.userId,
        value.notes,
      );
      return res.status(200).json({ success: true, data: result });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(400).json({ success: false, message: error.message });
    }
  }
}
