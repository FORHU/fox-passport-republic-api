import UsersRepo from "./users.repository";
import { RoleType, SystemRole } from "@prisma/client";
import { hashPassword } from "../../utils/password";
import { userCache } from "../../utils/cache-namespaces";
import { fingerprint } from "../../utils/cache.util";

/**
 * Two minutes.
 *
 * The reads below are the public, shared ones - listings and profiles, the
 * same answer for every caller - and they are the expensive kind: the foxer
 * listing filters on role, specialization, city and price, and the citizen
 * profile pulls a passport, badges, stamps, listings and posts.
 */
const USER_TTL = 120;
import { isOnline } from "../../infrastructure/socket/presence";

export default class UsersSvc {
  static async getPresence(userId: string) {
    const online = isOnline(userId);
    const lastActiveAt = online
      ? null
      : await UsersRepo.getLastActiveAt(userId);
    return { online, lastActiveAt };
  }

  // GET ALL USERS (optionally filtered by roleType, paginated, optionally searched)
  static async getAllUsers(
    roleTypes?: string[],
    page = 1,
    limit = 20,
    search?: string,
  ) {
    return userCache.cached(
      `all:${fingerprint({ roleTypes, page, limit, search })}`,
      USER_TTL,
      () =>
        UsersRepo.getAllUsers(
          roleTypes as RoleType[] | undefined,
          page,
          limit,
          search,
        ),
    );
  }

  // GET FOXERS (public listing, optionally filtered by roleType, specialization, city)
  // roleType may be a single value or a comma-separated list (e.g. "serviceFoxer,gearFoxer")
  static async getFoxers(
    limit = 9,
    page = 1,
    roleType?: string,
    specialization?: string,
    city?: string,
    maxPrice?: number,
  ) {
    const roleTypes = roleType
      ? (roleType
          .split(",")
          .map((r) => r.trim())
          .filter(Boolean) as RoleType[])
      : undefined;
    return userCache.cached(
      `foxers:${fingerprint({ limit, page, roleTypes, specialization, city, maxPrice })}`,
      USER_TTL,
      () =>
        UsersRepo.findFoxers(
          limit,
          page,
          roleTypes,
          specialization,
          city,
          maxPrice,
        ),
    );
  }

  // GET SINGLE FOXER BY ID (public profile with services)
  static async getFoxerById(id: string) {
    // The `throw` stays outside: `cached` stores a resolved value, so a
    // missing foxer has to keep failing after the entry is warm.
    const foxer = await userCache.cached(`foxer:${id}`, USER_TTL, () =>
      UsersRepo.findFoxerById(id),
    );
    if (!foxer) throw new Error("Foxer not found");
    return foxer;
  }

  // GET PUBLIC PROFILE (Citizen profile with passport, badges, stamps, listings, and posts)
  static async getPublicProfile(idOrUsername: string) {
    const profile = await userCache.cached(
      `publicProfile:${idOrUsername}`,
      USER_TTL,
      () => UsersRepo.findPublicCitizenProfile(idOrUsername),
    );
    if (!profile) throw new Error("Citizen profile not found");
    return profile;
  }

  /**
   * Deliberately not cached.
   *
   * It is a primary-key lookup - cheap, and not the kind of read this layer is
   * for - and it is the *hot* one: `updateUser`, `deleteUser` and
   * `getFoxerStats` all call it as an existence check before writing. Caching
   * it would put a stale row in front of the checks that guard writes, to save
   * an indexed lookup.
   */
  static async getUserById(id: string) {
    const user = await UsersRepo.findUserById(id);
    if (!user) {
      throw new Error("User not found");
    }
    return user;
  }

  // CREATE USER
  static async createUser(data: {
    email: string;
    username: string;
    password: string;
    name: string;
    role?: SystemRole;
  }) {
    const existingUser = await UsersRepo.getUserByEmail(data.email);
    if (existingUser) throw new Error("Email already exists");

    const hashedPassword = await hashPassword(data.password);

    return UsersRepo.createUser({
      ...data,
      password: hashedPassword,
    });
  }

  // ✅ UPDATE
  static async updateUser(
    id: string,
    data: Partial<{
      email: string;
      username: string;
      password: string;
      systemRole: SystemRole;
      name: string;
      isActive: boolean;
    }>,
  ) {
    const user = await UsersRepo.findUserById(id);
    if (!user) throw new Error("User not found");

    return UsersRepo.updateUser(id, data);
  }

  // BECOME HOST — adds "host" to roleType array
  static async becomeHost(userId: string) {
    return UsersRepo.addRoleType(userId, "eventFoxer");
  }

  // FOXER STATS
  static async getFoxerStats(userId: string) {
    const user = await UsersRepo.findUserById(userId);
    if (!user) throw new Error("User not found");
    // Four aggregates over bookings and revenue - the most expensive read in
    // this module.
    return userCache.cached(`foxerStats:${userId}`, USER_TTL, () =>
      UsersRepo.getFoxerStats(userId),
    );
  }

  // DELETE
  static async deleteUser(id: string) {
    const user = await UsersRepo.findUserById(id);
    if (!user) throw new Error("User not found");

    return UsersRepo.deleteUser(id);
  }
}
