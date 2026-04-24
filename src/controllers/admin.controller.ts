import { Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { RequestStatus } from "@prisma/client";

export default class AdminCtrl {
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
}
