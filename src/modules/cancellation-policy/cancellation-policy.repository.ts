import { prisma } from "../../utils/prisma";

export default class CancellationPolicyRepo {
  static async findAll() {
    return prisma.cancellationPolicy.findMany({
      where: { isActive: true },
      include: { rules: { orderBy: { hoursBeforeEvent: "desc" } } },
      orderBy: { name: "asc" },
    });
  }

  static async findById(id: string) {
    return prisma.cancellationPolicy.findUnique({
      where: { id },
      include: { rules: { orderBy: { hoursBeforeEvent: "desc" } } },
    });
  }

  static async create(data: {
    name: string;
    description?: string;
    rules: { hoursBeforeEvent: number; refundPercent: number }[];
  }) {
    const { rules, ...policyData } = data;
    return prisma.cancellationPolicy.create({
      data: {
        ...policyData,
        rules: { create: rules },
      },
      include: { rules: { orderBy: { hoursBeforeEvent: "desc" } } },
    });
  }

  static async update(
    id: string,
    data: {
      name?: string;
      description?: string;
      isActive?: boolean;
      rules?: { hoursBeforeEvent: number; refundPercent: number }[];
    },
  ) {
    const { rules, ...policyData } = data;
    if (rules) {
      await prisma.cancellationRule.deleteMany({ where: { policyId: id } });
    }
    return prisma.cancellationPolicy.update({
      where: { id },
      data: {
        ...policyData,
        ...(rules && { rules: { create: rules } }),
      },
      include: { rules: { orderBy: { hoursBeforeEvent: "desc" } } },
    });
  }

  static async softDelete(id: string) {
    return prisma.cancellationPolicy.update({
      where: { id },
      data: { isActive: false },
    });
  }

  static async policyExists(name: string, excludeId?: string) {
    const policy = await prisma.cancellationPolicy.findFirst({
      where: {
        name: { equals: name, mode: "insensitive" },
        ...(excludeId && { id: { not: excludeId } }),
      },
    });
    return !!policy;
  }
}
