import { Request, Response } from "express";
import PassportSvc from "../services/passport.service";
import { prisma } from "../utils/prisma";

export default class PassportCtrl {
  static async getMyPassport(req: Request, res: Response) {
    try {
      const passport = await PassportSvc.getOrCreate(req.user!.userId);
      return res.status(200).json({ success: true, data: passport });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  static async getPassportByUserId(req: Request, res: Response) {
    try {
      const passport = await PassportSvc.getByUserId(req.params.userId);
      if (!passport)
        return res.status(404).json({ success: false, message: "Passport not found" });
      return res.status(200).json({ success: true, data: passport });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  static async getAllBadges(req: Request, res: Response) {
    try {
      const badges = await prisma.badge.findMany({ orderBy: [{ path: "asc" }, { rarity: "asc" }] });
      return res.status(200).json({ success: true, data: badges });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }
}
