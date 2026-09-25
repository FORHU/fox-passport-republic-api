import { Request, Response } from "express";
import Joi from "joi";
import { AppointmentKind } from "@prisma/client";
import AppointmentService, { AppointmentError } from "./appointment.service";
import AppointmentAccess from "./appointment.access";
import type { AppointmentTarget } from "./appointment.repository";

function fail(res: Response, e: unknown) {
  if (e instanceof AppointmentError) {
    return res.status(e.status).json({ success: false, message: e.message });
  }
  console.error("Appointment error:", e);
  return res
    .status(500)
    .json({ success: false, message: "Something went wrong" });
}

function targetFrom(req: Request): AppointmentTarget {
  return req.params.eventId
    ? { eventId: req.params.eventId }
    : { venueId: req.params.venueId };
}

function caller(req: Request) {
  const { userId, systemRole } = req.user!;
  return { userId, systemRole };
}

const appointSchema = Joi.object({
  kind: Joi.string()
    .valid(...Object.values(AppointmentKind))
    .required(),
  // An email typed in, or the id of someone picked from the Organizer search.
  email: Joi.string().email(),
  userId: Joi.string(),
}).xor("email", "userId");

// `venueId` or `eventId`, from the query or the body: which Venue or Event an
// Organizer means.
function targetFromQuery(req: Request): AppointmentTarget | null {
  const { eventId, venueId } = { ...req.query, ...req.body } as Record<
    string,
    unknown
  >;
  if (typeof eventId === "string" && eventId) return { eventId };
  if (typeof venueId === "string" && venueId) return { venueId };
  return null;
}

function badTarget(res: Response) {
  return res
    .status(400)
    .json({ success: false, message: "eventId or venueId is required" });
}

export default class AppointmentController {
  // ── The Mayor's or Event Owner's side, on one Venue or Event ──────────

  static async list(req: Request, res: Response) {
    try {
      const data = await AppointmentService.list(targetFrom(req), caller(req));
      return res.status(200).json({ success: true, data });
    } catch (e) {
      return fail(res, e);
    }
  }

  static async appoint(req: Request, res: Response) {
    const { error, value } = appointSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
    try {
      const data = await AppointmentService.appoint(
        targetFrom(req),
        caller(req),
        value,
      );
      return res.status(201).json({ success: true, data });
    } catch (e) {
      return fail(res, e);
    }
  }

  static async remove(req: Request, res: Response) {
    try {
      await AppointmentService.remove(
        targetFrom(req),
        req.params.appointmentId,
        caller(req),
      );
      return res.status(204).send();
    } catch (e) {
      return fail(res, e);
    }
  }

  // ── The appointed person's side ───────────────────────────────────────

  static async mine(req: Request, res: Response) {
    try {
      const data = await AppointmentService.mine(req.user!.userId);
      return res.status(200).json({ success: true, data });
    } catch (e) {
      return fail(res, e);
    }
  }

  /** GET /appointments/access?eventId=… or ?venueId=… */
  static async access(req: Request, res: Response) {
    const { eventId, venueId } = req.query;
    const target =
      typeof eventId === "string" && eventId
        ? { eventId }
        : typeof venueId === "string" && venueId
          ? { venueId }
          : null;
    if (!target) {
      return res
        .status(400)
        .json({ success: false, message: "eventId or venueId is required" });
    }
    try {
      const data = await AppointmentAccess.describe(target, req.user!.userId);
      return res.status(200).json({ success: true, data });
    } catch (e) {
      return fail(res, e);
    }
  }

  // ── Organizer requests ────────────────────────────────────────────────

  /** GET /appointments/open: Venues and Events an Organizer can offer to run. */
  static async open(req: Request, res: Response) {
    try {
      const data = await AppointmentService.openToRequests(req.user!.userId);
      return res.status(200).json({ success: true, data });
    } catch (e) {
      return fail(res, e);
    }
  }

  /** GET /appointments/join-status?venueId=… — may I ask to join this? */
  static async joinStatus(req: Request, res: Response) {
    const target = targetFromQuery(req);
    if (!target) return badTarget(res);
    try {
      const data = await AppointmentService.joinStatus(
        target,
        req.user!.userId,
      );
      return res.status(200).json({ success: true, data });
    } catch (e) {
      return fail(res, e);
    }
  }

  /** POST /appointments/request { venueId | eventId } */
  static async request(req: Request, res: Response) {
    const target = targetFromQuery(req);
    if (!target) return badTarget(res);
    try {
      const data = await AppointmentService.requestToJoin(
        target,
        req.user!.userId,
      );
      return res.status(201).json({ success: true, data });
    } catch (e) {
      return fail(res, e);
    }
  }

  static async withdraw(req: Request, res: Response) {
    try {
      const data = await AppointmentService.withdrawRequest(
        req.params.appointmentId,
        req.user!.userId,
      );
      return res.status(200).json({ success: true, data });
    } catch (e) {
      return fail(res, e);
    }
  }

  /** GET /appointments/organizers?q=&specialization= */
  static async searchOrganizers(req: Request, res: Response) {
    try {
      const { q, specialization } = req.query;
      const data = await AppointmentService.searchOrganizers(
        { ...caller(req), roleType: req.user!.roleType },
        {
          q: typeof q === "string" ? q : undefined,
          specialization:
            typeof specialization === "string" ? specialization : undefined,
        },
      );
      return res.status(200).json({ success: true, data });
    } catch (e) {
      return fail(res, e);
    }
  }

  // ── The owner's side of requests, and the switch that allows them ─────

  static async approveRequest(req: Request, res: Response) {
    try {
      const data = await AppointmentService.respondToRequest(
        targetFrom(req),
        req.params.appointmentId,
        caller(req),
        true,
      );
      return res.status(200).json({ success: true, data });
    } catch (e) {
      return fail(res, e);
    }
  }

  static async declineRequest(req: Request, res: Response) {
    try {
      const data = await AppointmentService.respondToRequest(
        targetFrom(req),
        req.params.appointmentId,
        caller(req),
        false,
      );
      return res.status(200).json({ success: true, data });
    } catch (e) {
      return fail(res, e);
    }
  }

  static async getSettings(req: Request, res: Response) {
    try {
      const data = await AppointmentService.getSettings(
        targetFrom(req),
        caller(req),
      );
      return res.status(200).json({ success: true, data });
    } catch (e) {
      return fail(res, e);
    }
  }

  static async setSettings(req: Request, res: Response) {
    const { error, value } = Joi.object({
      acceptsOrganizerRequests: Joi.boolean().required(),
    }).validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
    try {
      const data = await AppointmentService.setSettings(
        targetFrom(req),
        caller(req),
        value,
      );
      return res.status(200).json({ success: true, data });
    } catch (e) {
      return fail(res, e);
    }
  }

  static async accept(req: Request, res: Response) {
    try {
      const data = await AppointmentService.accept(
        req.params.appointmentId,
        req.user!.userId,
      );
      return res.status(200).json({ success: true, data });
    } catch (e) {
      return fail(res, e);
    }
  }

  static async decline(req: Request, res: Response) {
    try {
      const data = await AppointmentService.decline(
        req.params.appointmentId,
        req.user!.userId,
      );
      return res.status(200).json({ success: true, data });
    } catch (e) {
      return fail(res, e);
    }
  }

  static async leave(req: Request, res: Response) {
    try {
      const data = await AppointmentService.leave(
        req.params.appointmentId,
        req.user!.userId,
      );
      return res.status(200).json({ success: true, data });
    } catch (e) {
      return fail(res, e);
    }
  }
}
