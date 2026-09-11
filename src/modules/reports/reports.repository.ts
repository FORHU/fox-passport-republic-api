import { prisma } from "../../utils/prisma";
import { ReportTargetType } from "@prisma/client";

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
}
