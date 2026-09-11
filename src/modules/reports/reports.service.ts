import { prisma } from "../../utils/prisma";
import { ReportTargetType } from "@prisma/client";
import ReportsRepo from "./reports.repository";
import { AuthenticatedUser } from "../../types/auth";

export default class ReportsService {
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
