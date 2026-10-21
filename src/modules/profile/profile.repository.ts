import { prisma } from "../../utils/prisma";
import { userCache } from "../../utils/cache-namespaces";

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
      phone?: string;
      imgId?: string;
      country?: string;
      state?: string;
      city?: string;
      district?: string;
      isPrivate?: boolean;
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

  static async deleteUser(userId: string) {
    return this.retiring(
      prisma.user.delete({
        where: { id: String(userId) },
        select: { id: true },
      }),
    );
  }
}
