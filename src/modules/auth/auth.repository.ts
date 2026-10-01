import { Prisma, OAuthProvider } from "@prisma/client";
import { prisma } from "../../utils/prisma";

export default class AuthRepo {
  // [MIGRATION-FLAG: Stage 3 Switch] Dual-writes passwordHash and populates 1:1 models (profile, settings, activity)
  static async createUser(data: {
    email: string;
    password: string;
    username: string;
    name: string;
    mobileNumber?: string;
    otpCode?: string;
    otpExpiry?: Date;
  }) {
    return prisma.user.create({
      data: {
        email: data.email,
        password: data.password,
        passwordHash: data.password,
        username: data.username,
        name: data.name,
        phone: data.mobileNumber,
        updatedAt: new Date(),
        profile: {
          create: {
            phone: data.mobileNumber,
            country: "Philippines",
          },
        },
        settings: {
          create: {
            preferredCurrency: "PHP",
          },
        },
        activity: {
          create: {
            lastActiveAt: new Date(),
            lastSeenAt: new Date(),
          },
        },
      },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        systemRole: true,
        roleType: true,
        createdAt: true,
      },
    });
  }

  /**
   * Loads the user WITH the password hash. The client omits it globally (see
   * utils/prisma.ts), so login has to ask for it explicitly — which is the
   * point: leaking it now takes a deliberate act, not a forgotten `select`.
   */
  static async findUserByEmail(email: string) {
    return prisma.user.findUnique({
      where: {
        email,
      },
      omit: { password: false },
    });
  }

  // [MIGRATION-FLAG: Stage 3 Switch] Dedicated OAuthAccount lookup
  static async findOAuthAccount(provider: OAuthProvider, providerAccountId: string) {
    return prisma.oAuthAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider,
          providerAccountId,
        },
      },
      include: {
        user: true,
      },
    });
  }

  // [MIGRATION-FLAG: Stage 3 Switch] Upsert OAuthAccount for user account linking
  static async linkOAuthAccount(data: {
    userId: string;
    provider: OAuthProvider;
    providerAccountId: string;
    email?: string;
    displayName?: string;
    avatarUrl?: string;
  }) {
    return prisma.oAuthAccount.upsert({
      where: {
        provider_providerAccountId: {
          provider: data.provider,
          providerAccountId: data.providerAccountId,
        },
      },
      create: {
        userId: data.userId,
        provider: data.provider,
        providerAccountId: data.providerAccountId,
        email: data.email,
        displayName: data.displayName,
        avatarUrl: data.avatarUrl,
      },
      update: {
        userId: data.userId,
        email: data.email,
        displayName: data.displayName,
        avatarUrl: data.avatarUrl,
      },
    });
  }

  // [MIGRATION-FLAG: Stage 3 Switch] Create user with OAuthAccount and 1:1 modular domain records
  static async createOAuthUser(data: {
    email: string;
    name: string;
    username: string;
    password?: string | null;
    passwordHash?: string | null;
    provider: OAuthProvider;
    providerAccountId: string;
    avatarUrl?: string;
  }) {
    return prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        username: data.username,
        password: data.password || null,
        passwordHash: data.passwordHash || data.password || null,
        imgId: data.avatarUrl,
        isEmailVerified: true,
        updatedAt: new Date(),
        profile: {
          create: {
            imgId: data.avatarUrl,
            country: "Philippines",
          },
        },
        settings: {
          create: {
            preferredCurrency: "PHP",
          },
        },
        activity: {
          create: {
            lastActiveAt: new Date(),
            lastSeenAt: new Date(),
          },
        },
        oauthAccounts: {
          create: {
            provider: data.provider,
            providerAccountId: data.providerAccountId,
            email: data.email,
            displayName: data.name,
            avatarUrl: data.avatarUrl,
          },
        },
      },
    });
  }

  static async findUserByGoogleId(googleId: string) {
    return prisma.user.findUnique({
      where: {
        googleId,
      },
    });
  }

  static async createGoogleUser(data: {
    email: string;
    name: string;
    username: string;
    password?: string | null;
    googleId: string;
    avatarUrl?: string;
  }) {
    return prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        username: data.username,
        password: data.password || null,
        passwordHash: data.password || null,
        googleId: data.googleId,
        imgId: data.avatarUrl,
        isEmailVerified: true,
        updatedAt: new Date(),
        profile: {
          create: {
            imgId: data.avatarUrl,
            country: "Philippines",
          },
        },
        settings: {
          create: {
            preferredCurrency: "PHP",
          },
        },
        activity: {
          create: {
            lastActiveAt: new Date(),
            lastSeenAt: new Date(),
          },
        },
        oauthAccounts: {
          create: {
            provider: OAuthProvider.GOOGLE,
            providerAccountId: data.googleId,
            email: data.email,
            displayName: data.name,
            avatarUrl: data.avatarUrl,
          },
        },
      },
    });
  }

  /**
   * `replacePassword`: a fresh hash to overwrite the existing one, for an
   * account whose email this link is the first to verify (see
   * GoogleAuthSvc.handleCallback).
   */
  static async linkGoogleId(
    userId: string,
    googleId: string,
    opts: { replacePassword?: string } = {},
  ) {
    return prisma.user.update({
      where: { id: userId },
      data: {
        googleId,
        isEmailVerified: true,
        ...(opts.replacePassword && {
          password: opts.replacePassword,
          passwordHash: opts.replacePassword,
        }),
      },
    });
  }

  static async updateUserLoginStatus(userId: string) {
    return prisma.user.update({
      where: {
        id: String(userId),
      },
      data: {
        updatedAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        systemRole: true,
        roleType: true,
      },
    });
  }

  static async findUserById(userId: string) {
    return prisma.user.findUnique({
      where: {
        id: String(userId),
      },
    });
  }

  static async findUserByUsername(username: string) {
    return prisma.user.findUnique({
      where: {
        username,
      },
    });
  }

  static async updateUser(
    userId: number | string,
    data: Prisma.UserUpdateInput,
  ) {
    return prisma.user.update({
      where: {
        id: String(userId),
      },
      data: data,
    });
  }

  static async getAuthUser(userId: number | string) {
    return prisma.user.findUnique({
      where: {
        id: String(userId),
      },
      select: {
        id: true,
        name: true,
        username: true,
        systemRole: true,
        roleType: true,
      },
    });
  }
}
