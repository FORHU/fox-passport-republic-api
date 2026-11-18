import { prisma } from "../../utils/prisma";
import { Prisma, RoleType } from "@prisma/client";
import { PERFORMER_SERVICE_CATEGORIES } from "../../types/permissions";
import { toRoleTypes } from "../../utils/enums";

export type ProviderBoard = "gear" | "services" | "performers";

/** Role filter values that pick one kind of Provider board. */
const PROVIDER_BOARD_BY_ROLE: Record<string, ProviderBoard> = {
  gear: "gear",
  gearFoxer: "gear",
  services: "services",
  serviceFoxer: "services",
  performers: "performers",
  performerFoxer: "performers",
};

/** Providers on each board: those with at least one listing of that kind. */
const PROVIDER_BOARD_WHERE: Record<ProviderBoard, Prisma.UserWhereInput> = {
  gear: { assets: { some: { deletedAt: null } } },
  services: {
    services: {
      some: {
        deletedAt: null,
        category: { notIn: [...PERFORMER_SERVICE_CATEGORIES] },
      },
    },
  },
  performers: {
    services: {
      some: {
        deletedAt: null,
        category: { in: [...PERFORMER_SERVICE_CATEGORIES] },
      },
    },
  },
};

class LeaderboardRepo {
  /**
   * Retrieves active Foxers filtered by role and city.
   */
  static async getFoxersForRanking(
    role?: string,
    city?: string,
    specialty?: string,
  ) {
    // A Provider board can be narrowed to what they list. The retired role
    // names (and the app's gear/services/performers) still name those boards.
    const supplyKind = role ? PROVIDER_BOARD_BY_ROLE[role] : undefined;
    const requested = supplyKind
      ? [RoleType.providerFoxer]
      : role
        ? toRoleTypes([role])
        : [];
    const whereRole: RoleType[] = requested.length
      ? requested
      : [RoleType.providerFoxer, RoleType.venueFoxer, RoleType.eventFoxer];

    const users = await prisma.user.findMany({
      where: {
        roleType: { hasSome: whereRole },
        ...(supplyKind ? PROVIDER_BOARD_WHERE[supplyKind] : {}),
        ...(city ? { city: { equals: city, mode: "insensitive" } } : {}),
        // A Provider appears under each specialty they declared (as search
        // does, RR-3).
        ...(specialty
          ? {
              foxerSpecializations: {
                some: { roleType: RoleType.providerFoxer, category: specialty },
              },
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        image: true,
        city: true,
        roleType: true,
        createdAt: true,
        // The first approved role is when they became a Foxer (foxerSince).
        roleRequests: {
          where: { status: "approved", reviewedAt: { not: null } },
          select: { reviewedAt: true },
          orderBy: { reviewedAt: "asc" },
          take: 1,
        },
        passport: {
          include: {
            paths: true,
          },
        },
      },
    });

    return users;
  }

  /** When they became a Foxer: their first approved role, else sign-up. */
  static async getFoxerSince(userId: string): Promise<Date | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        createdAt: true,
        roleRequests: {
          where: { status: "approved", reviewedAt: { not: null } },
          select: { reviewedAt: true },
          orderBy: { reviewedAt: "asc" },
          take: 1,
        },
      },
    });
    if (!user) return null;
    return user.roleRequests[0]?.reviewedAt ?? user.createdAt;
  }
}

export default LeaderboardRepo;
