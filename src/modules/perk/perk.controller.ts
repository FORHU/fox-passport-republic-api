import { Request, Response } from "express";
import { AppError, sendServerError } from "../../utils/errors";
import PerkSvc from "./perk.service";

export default class PerkCtrl {
  /**
   * GET /api/v1/perks: perks on offer, with the person's balance. `?eventId=`
   * narrows it to one event's perks.
   */
  static async list(req: Request, res: Response) {
    try {
      const eventId =
        typeof req.query.eventId === "string" && req.query.eventId !== ""
          ? req.query.eventId
          : undefined;
      const data = await PerkSvc.list(req.user!.userId, eventId);
      return res.status(200).json({ success: true, data });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: false });
    }
  }

  /** GET /api/v1/perks/mine: the person's perks, ready, used and returned. */
  static async mine(req: Request, res: Response) {
    try {
      const data = await PerkSvc.mine(req.user!.userId);
      return res.status(200).json({ success: true, data });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: false });
    }
  }

  /** GET /api/v1/perks/:id: one perk and the bookings it could be used on. */
  static async detail(req: Request, res: Response) {
    try {
      const data = await PerkSvc.detail(req.user!.userId, req.params.id);
      return res.status(200).json({ success: true, data });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: false });
    }
  }

  /** POST /api/v1/perks/:id/redeem { bookingId }: spend Tokens, get a code. */
  static async redeem(req: Request, res: Response) {
    try {
      const { bookingId } = req.body ?? {};
      if (typeof bookingId !== "string" || bookingId === "") {
        throw new AppError("bookingId is required", 400);
      }
      const data = await PerkSvc.redeem(
        req.user!.userId,
        req.params.id,
        bookingId,
      );
      return res.status(201).json({ success: true, data });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: false });
    }
  }

  /** POST /api/v1/perks: offer a perk on your own event or venue. */
  static async create(req: Request, res: Response) {
    try {
      const data = await PerkSvc.create(req.user!.userId, req.body ?? {});
      return res.status(201).json({ success: true, data });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: false });
    }
  }

  /** GET /api/v1/perks/offered: the perks you offer. */
  static async offered(req: Request, res: Response) {
    try {
      const data = await PerkSvc.listIssued(req.user!.userId);
      return res.status(200).json({ success: true, data });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: false });
    }
  }

  /** POST /api/v1/perks/:id/take-down: stop an offer, return the Tokens. */
  static async takeDown(req: Request, res: Response) {
    try {
      const data = await PerkSvc.takeDown(req.user!.userId, req.params.id);
      return res.status(200).json({ success: true, data });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: false });
    }
  }

  /** POST /api/v1/perks/check { code | live }: staff check a code. */
  static async check(req: Request, res: Response) {
    try {
      const data = await PerkSvc.check(req.user!.userId, req.body ?? {});
      return res.status(200).json({ success: true, data });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: false });
    }
  }

  /** POST /api/v1/perks/redemptions/:id/use: staff mark a perk used. */
  static async use(req: Request, res: Response) {
    try {
      const data = await PerkSvc.markUsed(req.user!.userId, req.params.id);
      return res.status(200).json({ success: true, data });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: false });
    }
  }

  /** GET /api/v1/perks/redemptions/:id/code: the live code for the door. */
  static async code(req: Request, res: Response) {
    try {
      const data = await PerkSvc.code(req.user!.userId, req.params.id);
      return res.status(200).json({ success: true, data });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: false });
    }
  }
}
