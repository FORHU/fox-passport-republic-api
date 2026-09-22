import { prisma } from "../../utils/prisma";
import { ReportTargetType } from "@prisma/client";
import ReportsRepo from "./reports.repository";
import { AuthenticatedUser } from "../../types/auth";

export default class ReportsService {
  static async getAdminReports(page = 1, limit = 50) {
    const safePage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
    const safeLimit = Number.isFinite(limit)
      ? Math.min(100, Math.max(1, Math.floor(limit)))
      : 50;
    const skip = (safePage - 1) * safeLimit;

    const [reports, total] = await Promise.all([
      prisma.report.findMany({
        orderBy: { createdAt: "desc" },
        skip,
        take: safeLimit,
        include: {
          reporter: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.report.count(),
    ]);

    const ids = {
      post: reports
        .filter((r) => r.targetType === ReportTargetType.post)
        .map((r) => r.targetId),
      user: reports
        .filter((r) => r.targetType === ReportTargetType.user)
        .map((r) => r.targetId),
      venue: reports
        .filter((r) => r.targetType === ReportTargetType.venue)
        .map((r) => r.targetId),
    };
    const [posts, users, venues] = await Promise.all([
      prisma.post.findMany({
        where: { id: { in: ids.post } },
        select: { id: true, content: true, author: { select: { name: true } } },
      }),
      prisma.user.findMany({
        where: { id: { in: ids.user } },
        select: { id: true, name: true, email: true },
      }),
      prisma.venue.findMany({
        where: { id: { in: ids.venue } },
        select: { id: true, name: true, status: true },
      }),
    ]);
    const byId = {
      post: new Map(posts.map((target) => [target.id, target])),
      user: new Map(users.map((target) => [target.id, target])),
      venue: new Map(venues.map((target) => [target.id, target])),
    };

    return {
      rows: reports.map((report) => ({
        id: report.id,
        targetType: report.targetType,
        targetId: report.targetId,
        reason: report.reason,
        details: report.details,
        createdAt: report.createdAt,
        reporter: report.reporter,
        target: byId[report.targetType].get(report.targetId) ?? null,
      })),
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.max(1, Math.ceil(total / safeLimit)),
      },
    };
  }

  static async fileReport(
    user: AuthenticatedUser,
    input: {
      targetType: ReportTargetType;
      targetId: string;
      reason: string;
      details?: string;
    },
  ) {
    const { targetType, targetId, reason, details } = input;

    if (targetType === ReportTargetType.post) {
      const post = await prisma.post.findUnique({ where: { id: targetId } });
      if (!post) throw new Error("Post not found");
    } else if (targetType === ReportTargetType.venue) {
      const venue = await prisma.venue.findUnique({ where: { id: targetId } });
      if (!venue) throw new Error("Venue not found");
    } else {
      const target = await prisma.user.findUnique({ where: { id: targetId } });
      if (!target) throw new Error("User not found");
      if (targetId === user.userId) {
        throw new Error("You cannot report yourself");
      }
    }

    return ReportsRepo.create({
      reporterId: user.userId,
      targetType,
      targetId,
      reason,
      details,
    });
  }
}
