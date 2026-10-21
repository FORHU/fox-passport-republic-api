import { Request, Response } from "express";
import { AppError, sendServerError } from "../../utils/errors";
import CalendarSvc from "./calendar.service";

export default class CalendarCtrl {
  // GET /calendar?from=ISO&to=ISO[&blocks=1] — the signed-in person's calendar.
  static async getMine(req: Request, res: Response) {
    const from = new Date(String(req.query.from ?? ""));
    const to = new Date(String(req.query.to ?? ""));
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return res
        .status(400)
        .json({ success: false, message: "`from` and `to` must be ISO dates" });
    }
    // `blocks=1` also returns the days the person's venues have closed.
    const includeBlocks = ["1", "true"].includes(String(req.query.blocks));
    try {
      const data = await CalendarSvc.forViewer(req.user!.userId, from, to, {
        includeBlocks,
      });
      return res.status(200).json({ success: true, data });
    } catch (e: unknown) {
      if (e instanceof AppError) {
        return res
          .status(e.status)
          .json({ success: false, message: e.message });
      }
      return sendServerError(res, e);
    }
  }
}
