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

  /** Bookings the account holds that were not cancelled. */
  static async countActiveBookings(userId: string): Promise<number> {
    return prisma.booking.count({
      where: { userId, status: { not: "cancelled" } },
    });
  }

  /**
   * What the server-detected steps are judged on: the four profile fields
   * (the photo may live on the account or on its profile row) and whether an
   * admin has approved the account's ID.
   */
  static async findDetectionFacts(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: {
        username: true,
        bio: true,
        city: true,
        imgId: true,
        image: true,
        identityVerifiedAt: true,
        profile: { select: { imgId: true } },
      },
    });
  }
}
