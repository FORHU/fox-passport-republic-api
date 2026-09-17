import { prisma } from "../../utils/prisma";

export default class PlatformFeeConfigRepo {
  static async findAll(includeInactive = false) {
    return prisma.platformFeeConfig.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: [{ priority: "desc" }, { name: "asc" }],
    });
  }

  static async findById(id: string) {
    return prisma.platformFeeConfig.findUnique({ where: { id } });
  }

  static async create(data: {
    name: string;
    transactionType?: string | null;
    category?: string | null;
    subcategory?: string | null;
    percentage?: number | null;
    fixedAmount?: number | null;
    currency?: string;
    priority?: number;
    effectiveFrom?: Date;
    effectiveUntil?: Date | null;
  }) {
    return prisma.platformFeeConfig.create({ data });
  }

  static async update(
    id: string,
    data: Partial<{
      name: string;
      transactionType: string | null;
      category: string | null;
      subcategory: string | null;
      percentage: number | null;
      fixedAmount: number | null;
      currency: string;
      priority: number;
      active: boolean;
      effectiveFrom: Date;
      effectiveUntil: Date | null;
    }>,
  ) {
    return prisma.platformFeeConfig.update({ where: { id }, data });
  }

  static async softDelete(id: string) {
    return prisma.platformFeeConfig.update({
      where: { id },
      data: { active: false },
    });
  }
}
