import { Request, Response } from "express";
import { AppError, sendServerError } from "../../utils/errors";
import PerkSvc from "./perk.service";

export default class PerkCtrl {
  /** GET /api/v1/perks: perks on offer, with the person's balance. */
  static async list(req: Request, res: Response) {
    try {
      const data = await PerkSvc.list(req.user!.userId);
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
