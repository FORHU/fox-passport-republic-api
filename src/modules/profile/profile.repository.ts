import {
  ItemBookingStatus,
  Prisma,
  RoleType,
  ServiceCategory,
} from "@prisma/client";
import { prisma } from "../../utils/prisma";
import { userCache, eventTemplateCache } from "../../utils/cache-namespaces";

export default class ProfileRepo {
  /** A profile edit changes what the public listings show. */
  private static async retiring<T>(write: Promise<T>): Promise<T> {
    const result = await write;
    await userCache.invalidateAll();
    return result;
  }

  // [MIGRATION-FLAG: Stage 3 Switch] Read modular profile and settings relations with fallback to legacy fields
  static async findProfileById(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: String(userId) },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        phone: true,
        imgId: true,
        country: true,
        state: true,
        city: true,
        district: true,
        systemRole: true,
        roleType: true,
        // What the app's booking pages check before letting someone book —
        // the same flag the booking services enforce.
        isEmailVerified: true,
        isPrivate: true,
        bio: true,
        socialLinks: true,
        preferredCurrency: true,
        // The "Verified" badge — display only.
        identityVerifiedAt: true,
        createdAt: true,
        updatedAt: true,
        profile: {
          select: {
            phone: true,
            imgId: true,
            city: true,
            address: true,
            state: true,
            country: true,
            isPrivate: true,
          },
        },
        settings: {
          select: {
            preferredCurrency: true,
          },
        },
      },
    });

    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      name: user.name,
      phone: user.profile?.phone ?? user.phone,
      imgId: user.profile?.imgId ?? user.imgId,
      city: user.profile?.city ?? user.city,
      systemRole: user.systemRole,
      roleType: user.roleType,
      isPrivate: user.profile?.isPrivate ?? user.isPrivate,
      bio: user.bio,
      socialLinks: user.socialLinks,
      preferredCurrency:
        user.settings?.preferredCurrency ?? user.preferredCurrency,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      profile: user.profile,
      settings: user.settings,
    };
  }

  /**
   * The user and their sign-in password hash. The hash lives on the Better Auth
   * credential account — the one sign-in and password reset use — not on
   * `User.password`, which nothing updates any more. `password` is null for an
   * account that signs in only with Google/Facebook.
   */
  static async findUserForPasswordCheck(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: String(userId) },
      select: { id: true },
    });
    if (!user) return null;
    const credential = await prisma.account.findFirst({
      where: { userId: user.id, providerId: "credential" },
      select: { password: true },
    });
    return { id: user.id, password: credential?.password ?? null };
  }

  static async findByUsernameExcludingUserId(
    username: string,
    excludeUserId: string,
  ) {
    return prisma.user.findFirst({
      where: {
        username,
        NOT: { id: String(excludeUserId) },
      },
      select: { id: true },
    });
  }

  // [MIGRATION-FLAG: Stage 3 Switch] Dual-write to user_profiles, user_settings, and legacy user columns
  static async updateProfile(
    userId: string,
    data: {
      name?: string;
      username?: string;
      phone?: string | null;
      imgId?: string;
      country?: string;
      state?: string;
      city?: string;
      district?: string;
      isPrivate?: boolean;
      bio?: string | null;
      socialLinks?: Record<string, string> | null;
      preferredCurrency?: string;
    },
  ) {
    return this.retiring(
      prisma.$transaction(async (tx) => {
        const user = await tx.user.update({
          where: { id: String(userId) },
          data: {
            ...(data.name !== undefined && { name: data.name }),
            ...(data.username !== undefined && { username: data.username }),
            // Legacy dual-write
            ...(data.phone !== undefined && { phone: data.phone }),
            ...(data.imgId !== undefined && { imgId: data.imgId }),
            ...(data.country !== undefined && { country: data.country }),
            ...(data.state !== undefined && { state: data.state }),
            ...(data.city !== undefined && { city: data.city }),
            ...(data.district !== undefined && { district: data.district }),
            ...(data.isPrivate !== undefined && { isPrivate: data.isPrivate }),
            ...(data.bio !== undefined && { bio: data.bio }),
            ...(data.socialLinks !== undefined && {
              socialLinks: data.socialLinks ?? Prisma.DbNull,
            }),
            ...(data.preferredCurrency !== undefined && {
              preferredCurrency: data.preferredCurrency,
            }),
          },
          select: {
            id: true,
            email: true,
            username: true,
            name: true,
            systemRole: true,
            roleType: true,
            district: true,
            bio: true,
            socialLinks: true,
            updatedAt: true,
          },
        });

        const profile = await tx.userProfile.upsert({
          where: { userId: String(userId) },
          create: {
            userId: String(userId),
            phone: data.phone,
            imgId: data.imgId,
            city: data.city,
            state: data.state,
            country: data.country ?? "Philippines",
            isPrivate: data.isPrivate ?? false,
          },
          update: {
            ...(data.phone !== undefined && { phone: data.phone }),
            ...(data.imgId !== undefined && { imgId: data.imgId }),
            ...(data.city !== undefined && { city: data.city }),
            ...(data.state !== undefined && { state: data.state }),
            ...(data.country !== undefined && { country: data.country }),
            ...(data.isPrivate !== undefined && { isPrivate: data.isPrivate }),
          },
        });

        let settings;
        if (data.preferredCurrency !== undefined) {
          settings = await tx.userSettings.upsert({
            where: { userId: String(userId) },
            create: {
              userId: String(userId),
              preferredCurrency: data.preferredCurrency,
            },
            update: {
              preferredCurrency: data.preferredCurrency,
            },
          });
        }

        return {
          ...user,
          phone: profile.phone,
          imgId: profile.imgId,
          city: profile.city,
          state: profile.state,
          country: profile.country,
          isPrivate: profile.isPrivate,
          preferredCurrency:
            settings?.preferredCurrency ?? data.preferredCurrency ?? "PHP",
          profile,
          settings,
        };
      }),
    );
  }

  /** Sets the sign-in password on the Better Auth credential account. */
  static async updatePasswordHash(userId: string, passwordHash: string) {
    return this.retiring(
      prisma.account.updateMany({
        where: { userId: String(userId), providerId: "credential" },
        data: { password: passwordHash },
      }),
    );
  }

  /** The EventFoxer's one commission rate (#264 D5), in percent. */
  static async findCommissionPct(userId: string) {
    return prisma.user.findUnique({
      where: { id: String(userId) },
      select: { id: true, commissionPct: true },
    });
  }

  /**
   * Sets the rate and returns the one it replaced, read in the same
   * transaction so the audit entry's "previous" can't be another request's
   * value. Only `users.commissionPct` changes: an Event stores the rate it
   * was priced with (a booking or a request), so it keeps the price its
   * client was quoted, and everything priced from now on takes the new rate.
   *
   * Templates are cached with their owner's rate, so the cache is cleared:
   * otherwise previews and bookings could use the old rate for a while.
   */
  static async updateCommissionPct(userId: string, commissionPct: number) {
    const result = await prisma.$transaction(async (tx) => {
      const before = await tx.user.findUnique({
        where: { id: String(userId) },
        select: { commissionPct: true },
      });
      if (!before) return null;
      const after = await tx.user.update({
        where: { id: String(userId) },
        data: { commissionPct },
        select: { commissionPct: true },
      });
      return { previous: before.commissionPct, current: after.commissionPct };
    });
    if (result) await eventTemplateCache.invalidateAll();
    return result;
  }

  /**
   * The organizer's Events that have a booking which isn't cancelled and
   * haven't ended: these keep the rate their clients saw (#264 D6, Q11).
   * The soonest 100, so a busy EventFoxer's response stays small.
   */
  static async findBookedUpcomingEvents(organizerId: string, now: Date) {
    return prisma.event.findMany({
      where: {
        organizerId: String(organizerId),
        endAt: { gte: now },
        bookings: { some: { status: { not: "cancelled" } } },
      },
      select: { id: true, name: true, startAt: true, commissionPct: true },
      orderBy: { startAt: "asc" },
      take: 100,
    });
  }

  static async deleteUser(userId: string) {
    return this.retiring(
      prisma.user.delete({
        where: { id: String(userId) },
        select: { id: true },
      }),
    );
  }
  /** The roles a user holds. */
  static async findRoleTypes(userId: string): Promise<RoleType[]> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { roleType: true },
    });
    return user?.roleType ?? [];
  }

  /** The specialties a Provider has, declared or earned. */
  static async findProviderSpecialtyCategories(
    userId: string,
  ): Promise<string[]> {
    const rows = await prisma.foxerSpecialization.findMany({
      where: { userId, roleType: RoleType.providerFoxer },
      select: { category: true },
      orderBy: { category: "asc" },
    });
    return rows.map((r) => r.category);
  }

  /**
   * Which of `categories` still have a booking ahead for this Provider: a
   * service or an asset in that category with an open booking that has not
   * ended. Specialties span both vocabularies, so each is matched against the
   * kind of listing that carries it.
   */
  static async categoriesWithUpcomingBookings(
    userId: string,
    categories: string[],
  ): Promise<string[]> {
    if (categories.length === 0) return [];

    const now = new Date();
    const open = {
      notIn: [ItemBookingStatus.completed, ItemBookingStatus.cancelled],
    };
    const serviceValues = Object.values(ServiceCategory) as string[];
    const serviceCategories = categories.filter((c) =>
      serviceValues.includes(c),
    ) as ServiceCategory[];

    const [services, assets] = await Promise.all([
      serviceCategories.length === 0
        ? []
        : prisma.service.findMany({
            where: {
              ownerId: userId,
              deletedAt: null,
              category: { in: serviceCategories },
              bookings: {
                some: { status: open, scheduledDate: { gte: now } },
              },
            },
            select: { category: true },
            distinct: ["category"],
          }),
      prisma.asset.findMany({
        where: {
          ownerId: userId,
          deletedAt: null,
          category: { in: categories },
          bookings: { some: { status: open, endDate: { gte: now } } },
        },
        select: { category: true },
        distinct: ["category"],
      }),
    ]);

    return [
      ...new Set([
        ...services.map((s) => s.category as string),
        ...assets.map((a) => a.category),
      ]),
    ];
  }

  /** Removes and adds a Provider's specialties together, so a failure leaves them as they were. */
  static async replaceProviderSpecialties(
    userId: string,
    remove: string[],
    add: string[],
  ) {
    await this.retiring(
      prisma.$transaction([
        prisma.foxerSpecialization.deleteMany({
          where: {
            userId,
            roleType: RoleType.providerFoxer,
            category: { in: remove },
          },
        }),
        prisma.foxerSpecialization.createMany({
          data: add.map((category) => ({
            userId,
            roleType: RoleType.providerFoxer,
            category,
            source: "declared",
          })),
          skipDuplicates: true,
        }),
      ]),
    );
  }
}
