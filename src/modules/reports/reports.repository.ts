import { prisma } from "../../utils/prisma";
import { ReportStatus, ReportTargetType } from "@prisma/client";

export default class ReportsRepo {
  static async create(data: {
    reporterId: string;
    targetType: ReportTargetType;
    targetId: string;
    reason: string;
    details?: string;
  }) {
    return prisma.report.create({ data });
  }

  static async findById(id: string) {
    return prisma.report.findUnique({ where: { id } });
  }

  static async resolve(
    id: string,
    data: {
      status: Extract<ReportStatus, "dismissed" | "actioned">;
      resolvedById: string;
      resolutionNote?: string;
    },
  ) {
    return prisma.report.update({
      where: { id },
      data: {
        status: data.status,
        resolvedById: data.resolvedById,
        resolvedAt: new Date(),
        resolutionNote: data.resolutionNote,
      },
    });
  }
}
