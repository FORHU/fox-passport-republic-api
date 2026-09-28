import { prisma } from "../../utils/prisma";
import { ReportStatus, ReportTargetType } from "@prisma/client";
import ReportsRepo from "./reports.repository";
import { AuthenticatedUser } from "../../types/auth";

export default class ReportsService {
  static async getAdminReports(
    page = 1,
    limit = 50,
    targetType?: ReportTargetType,
  ) {
    const safePage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
    const safeLimit = Number.isFinite(limit)
      ? Math.min(100, Math.max(1, Math.floor(limit)))
      : 50;
    const skip = (safePage - 1) * safeLimit;
    const where = targetType ? { targetType } : {};

    const [reports, total, counts] = await Promise.all([
      prisma.report.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: safeLimit,
        include: {
          reporter: { select: { id: true, name: true, email: true } },
          resolvedBy: { select: { id: true, name: true } },
        },
      }),
      prisma.report.count({ where }),
      prisma.report.groupBy({
        by: ["targetType"],
        _count: { _all: true },
      }),
    ]);

    const countByType: Record<ReportTargetType, number> = {
      post: 0,
      user: 0,
      venue: 0,
    };
    for (const row of counts) countByType[row.targetType] = row._count._all;

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
        status: report.status,
        resolvedBy: report.resolvedBy,
        resolvedAt: report.resolvedAt,
        resolutionNote: report.resolutionNote,
      })),
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.max(1, Math.ceil(total / safeLimit)),
      },
      counts: countByType,
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

  /**
   * Records a decision on a report — dismissed (no violation found) or
   * actioned (admin took a real moderation step against the target through
   * that target's own endpoint, e.g. PATCH /admin/venues/:id/reject). This
   * call only logs the outcome; it never touches the target itself.
   */
  static async resolveReport(
    user: AuthenticatedUser,
    reportId: string,
    input: {
      status: Extract<ReportStatus, "dismissed" | "actioned">;
      resolutionNote?: string;
    },
  ) {
    const report = await ReportsRepo.findById(reportId);
    if (!report) throw new Error("Report not found");
    if (report.status !== ReportStatus.open) {
      throw new Error("Report has already been resolved");
    }

    return ReportsRepo.resolve(reportId, {
      status: input.status,
      resolvedById: user.userId,
      resolutionNote: input.resolutionNote,
    });
  }
}
