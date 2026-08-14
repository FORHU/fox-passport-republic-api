import { Request, Response } from "express";
import PassportSvc from "../services/passport.service";
import { prisma } from "../utils/prisma";

export default class PassportCtrl {
  static async getMyPassport(req: Request, res: Response) {
    try {
      const passport = await PassportSvc.getOrCreate(req.user!.userId);
      return res.status(200).json({ success: true, data: passport });
    } catch (e: unknown) {
      const err = e as Error;
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  static async getPassportByUserId(req: Request, res: Response) {
    try {
      const passport = await PassportSvc.getByUserId(req.params.userId);
      if (!passport)
        return res
          .status(404)
          .json({ success: false, message: "Passport not found" });
      return res.status(200).json({ success: true, data: passport });
    } catch (e: unknown) {
      const err = e as Error;
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  static async getAllBadges(req: Request, res: Response) {
    try {
      const badges = await prisma.badge.findMany({
        orderBy: [{ path: "asc" }, { rarity: "asc" }],
      });
      return res.status(200).json({ success: true, data: badges });
    } catch (e: unknown) {
      const err = e as Error;
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  static async getLeaderboard(req: Request, res: Response) {
    try {
      const limit = Math.min(Number(req.query.limit) || 20, 50);
      const data = await PassportSvc.getLeaderboard(limit);
      return res.status(200).json({ success: true, data });
    } catch (e: unknown) {
      const err = e as Error;
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  // host_support perk: returns priority support contact — 403 without perk
  static async getPrioritySupportContact(req: Request, res: Response) {
    try {
      const userId = req.user?.userId as string;
      const hasHostSupport = await PassportSvc.hasPerk(userId, "host_support");
      if (!hasHostSupport) {
        return res.status(403).json({
          success: false,
          message: "Host Support perk required — unlock at Event Foxer Level 1",
        });
      }
      return res.status(200).json({
        success: true,
        data: {
          email: "priority@foxpassport.com",
          whatsapp: "+63-900-FOX-HOST",
          responseTime: "Within 1 hour, 24/7",
          note: "Exclusive to Event Foxers with Host Support perk",
        },
      });
    } catch (e: unknown) {
      const err = e as Error;
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  // founding_citizen perk: returns OG badge info for a user — for profile display
  static async getMyBadges(req: Request, res: Response) {
    try {
      const userId = req.user?.userId as string;
      const perks = await PassportSvc.getPerks(userId);
      return res.status(200).json({
        success: true,
        data: {
          isFoundingCitizen: perks.includes("founding_citizen"),
          perks,
        },
      });
    } catch (e: unknown) {
      const err = e as Error;
      return res.status(500).json({ success: false, message: err.message });
    }
  }
}
