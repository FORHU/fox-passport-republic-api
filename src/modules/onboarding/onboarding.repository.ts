import { prisma } from "../../utils/prisma";

export default class OnboardingRepo {
  /** The steps this account has finished. */
  static async findCompletedSteps(userId: string) {
    return prisma.userOnboarding.findMany({
      where: { userId },
      select: { step: true, completedAt: true },
      orderBy: { completedAt: "asc" },
    });
  }

  static async isCompleted(userId: string, step: string): Promise<boolean> {
    const row = await prisma.userOnboarding.findUnique({
      where: { userId_step: { userId, step } },
      select: { id: true },
    });
    return !!row;
  }

  /** Records a step once. A repeat is ignored by the unique (userId, step). */
  static async markCompleted(userId: string, step: string): Promise<void> {
    await prisma.userOnboarding.createMany({
      data: [{ userId, step }],
      skipDuplicates: true,
    });
  }
}
