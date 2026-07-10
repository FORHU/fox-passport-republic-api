import { Request, Response } from "express";
import StampSvc from "../services/stamp.service";

export default class StampCtrl {
  static async createStamp(req: Request, res: Response) {
    try {
      const { bookingId } = req.body;
      const userId = req.user!.userId;

      if (!bookingId) {
        return res
          .status(400)
          .json({ success: false, message: "bookingId is required" });
      }

      const stamp = await StampSvc.createStamp(userId, bookingId);
      return res.status(201).json({ success: true, data: stamp });
    } catch (error: any) {
      if (error.message === "DUPLICATE_STAMP") {
        return res.status(400).json({
          success: false,
          message: "A stamp for this booking already exists",
        });
      }
      if (error.message === "BOOKING_NOT_FOUND") {
        return res
          .status(404)
          .json({ success: false, message: "Booking not found" });
      }
      if (error.message === "FORBIDDEN") {
        return res.status(403).json({
          success: false,
          message: "This booking does not belong to the current user",
        });
      }
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getStamps(req: Request, res: Response) {
    try {
      const { userId } = req.query as { userId?: string };

      if (!userId) {
        return res
          .status(400)
          .json({ success: false, message: "userId query param is required" });
      }

      const stamps = await StampSvc.getStampsByUser(userId);
      return res.status(200).json({ success: true, data: stamps });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}
