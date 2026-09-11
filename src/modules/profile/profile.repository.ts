import { prisma } from "../../utils/prisma";
import { userCache } from "../../utils/cache-namespaces";

export default class ProfileRepo {
  /** A profile edit changes what the public listings show. */
  private static async retiring<T>(write: Promise<T>): Promise<T> {
    const result = await write;
    await userCache.invalidateAll();
    return result;
  }

  static async findProfileById(userId: string) {
    return prisma.user.findUnique({
      where: { id: String(userId) },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        phone: true,
        imgId: true,
        systemRole: true,
        roleType: true,
        isPrivate: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  static async findUserForPasswordCheck(userId: string) {
    return prisma.user.findUnique({
      where: { id: String(userId) },
      select: {
        id: true,
        password: true,
      },
    });
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

  static async updateProfile(
    userId: string,
    data: {
      name?: string;
      username?: string;
      phone?: string;
      imgId?: string;
      city?: string;
      isPrivate?: boolean;
    },
  ) {
    return this.retiring(
      prisma.user.update({
        where: { id: String(userId) },
        data,
        select: {
          id: true,
          email: true,
          username: true,
          name: true,
          phone: true,
          imgId: true,
          city: true,
          systemRole: true,
          roleType: true,
          isPrivate: true,
          updatedAt: true,
        },
      }),
    );
  }

  static async updatePasswordHash(userId: string, passwordHash: string) {
    // A password is not displayed anywhere, so by the rule in
    // `cache-namespaces.ts` this need not retire the cache. It does anyway:
    // password changes are rare, one `INCR` costs nothing, and one fewer
    // exception to remember is worth more than the hit rate it protects.
    return this.retiring(
      prisma.user.update({
        where: { id: String(userId) },
        data: { password: passwordHash },
        select: { id: true },
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
