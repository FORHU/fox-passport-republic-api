import { Prisma } from "@prisma/client";
import { prisma } from "../../utils/prisma";

/** The Foxer roles the leaderboard can be filtered by. */
export const LEADERBOARD_ROLES = [
  "venue",
  "event",
  "gear",
  "services",
  "performers",
] as const;
export type LeaderboardRole = (typeof LEADERBOARD_ROLES)[number];

/**
 * What each role counts and who may appear. `roles` are the account roles that
 * qualify a person for the role's board; `paths` are the XP paths their rank
 * is read from (the highest level among them).
 *
 * Counts are completed bookings: for venues, gear and services the
 * provider's approved transaction on a booking that is completed; for events
 * the host's own completed bookings. Nothing here is built from user input, so
 * the fragments can be interpolated safely.
 */
const ROLE_CONFIG: Record<
  LeaderboardRole,
  { roles: string[]; paths: string[]; counts: (w: Window) => Prisma.Sql }
> = {
  venue: {
    roles: ["venueFoxer"],
    paths: ["venueFoxer"],
    counts: (w) => providerCounts("event_venue_transactions", w),
  },
  event: {
    roles: ["eventFoxer"],
    paths: ["eventFoxer"],
    counts: (w) => Prisma.sql`
      SELECT e."organizerId" AS "userId", COUNT(*)::int AS "n"
        FROM "bookings" b
        JOIN "events" e ON e."id" = b."eventId"
       WHERE b."status"::text = 'completed'
         AND b."endAt" >= ${w.from} AND b."endAt" < ${w.to}
       GROUP BY e."organizerId"`,
  },
  gear: {
    roles: ["gearFoxer", "providerFoxer"],
    paths: ["gearFoxer", "providerFoxer"],
    counts: (w) => providerCounts("event_asset_transactions", w),
  },
  services: {
    roles: ["serviceFoxer", "providerFoxer"],
    paths: ["serviceFoxer", "providerFoxer"],
    counts: (w) => providerCounts("event_service_transactions", w),
  },
  performers: {
    roles: ["performerFoxer"],
    paths: ["performerFoxer"],
    counts: (w) => providerCounts("event_service_transactions", w),
  },
};

export interface Window {
  /** Inclusive start, as an instant. */
  from: Date;
  /** Exclusive end. */
  to: Date;
}

/** Approved provider transactions on bookings that were completed. */
function providerCounts(table: string, w: Window): Prisma.Sql {
  return Prisma.sql`
    SELECT t."providerId" AS "userId", COUNT(*)::int AS "n"
      FROM ${Prisma.raw(`"${table}"`)} t
      JOIN "bookings" b ON b."id" = t."bookingId"
     WHERE t."status"::text = 'approved'
       AND b."status"::text = 'completed'
       AND b."endAt" >= ${w.from} AND b."endAt" < ${w.to}
     GROUP BY t."providerId"`;
}

export interface LeaderboardRow {
  position: number;
  userId: string;
  name: string;
  username: string | null;
  image: string | null;
  city: string | null;
  /** Highest level among the role's XP paths; 1 with none. */
  level: number;
  /** The path that level is on, so the rank takes the right names. */
  path: string;
}

/** A citizen on the board. Their rank is read from `level` on the citizen path. */
export interface CitizenRow {
  position: number;
  userId: string;
  name: string;
  username: string | null;
  image: string | null;
  city: string | null;
  level: number;
}

type RawCitizen = Omit<CitizenRow, "level"> & { level: number | null };

function toCitizen(r: RawCitizen): CitizenRow {
  return { ...r, level: r.level ?? 1 };
}

export default class LeaderboardRepo {
  /** The profile city of a user, or null when none is set. */
  static async cityOf(userId: string): Promise<string | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { city: true },
    });
    const city = user?.city?.trim();
    return city ? city : null;
  }

  /**
   * Citizens ranked by XP gained on the citizen path in the window, best
   * first, optionally limited to one city. A grant that was later reversed (a
   * `REVERSAL` row) is left out, so a refunded booking earns nothing. Ties
   * share a position; XP itself is never returned.
   */
  static async citizensByMonth(
    window: Window,
    city: string | null,
  ): Promise<CitizenRow[]> {
    const rows = await prisma.$queryRaw<RawCitizen[]>(Prisma.sql`
      WITH gained AS (
        SELECT e."userId" AS "userId", SUM(e."xp")::int AS "xp"
          FROM "reward_events" e
         WHERE e."path"::text = 'user'
           AND e."xp" > 0
           AND e."createdAt" >= ${window.from} AND e."createdAt" < ${window.to}
           AND NOT EXISTS (
             SELECT 1 FROM "reward_lifecycles" l
              WHERE l."grantEventId" = e."id" AND l."type"::text = 'REVERSAL'
           )
         GROUP BY e."userId"
      )
      SELECT RANK() OVER (ORDER BY g."xp" DESC)::int AS "position",
             u."id" AS "userId",
             u."name" AS "name",
             u."username" AS "username",
             u."image" AS "image",
             u."city" AS "city",
             pp."level" AS "level"
        FROM gained g
        JOIN "users" u ON u."id" = g."userId"
        LEFT JOIN "passports" p ON p."userId" = u."id"
        LEFT JOIN "passport_paths" pp
               ON pp."passportId" = p."id" AND pp."path"::text = 'user'
       WHERE (${city}::text IS NULL OR lower(u."city") = lower(${city}::text))
       ORDER BY g."xp" DESC, u."name" ASC, u."id" ASC`);
    return rows.map(toCitizen);
  }

  /**
   * Citizens ranked by level, then total XP, best first, over everyone who has
   * earned any XP. Ties (same level and XP) share a position.
   */
  static async citizensAllTime(): Promise<CitizenRow[]> {
    const rows = await prisma.$queryRaw<RawCitizen[]>(Prisma.sql`
      SELECT RANK() OVER (ORDER BY pp."level" DESC, pp."totalXP" DESC)::int
               AS "position",
             u."id" AS "userId",
             u."name" AS "name",
             u."username" AS "username",
             u."image" AS "image",
             u."city" AS "city",
             pp."level" AS "level"
        FROM "passport_paths" pp
        JOIN "passports" p ON p."id" = pp."passportId"
        JOIN "users" u ON u."id" = p."userId"
       WHERE pp."path"::text = 'user' AND pp."totalXP" > 0
       ORDER BY pp."level" DESC, pp."totalXP" DESC, u."name" ASC, u."id" ASC`);
    return rows.map(toCitizen);
  }

  /**
   * Every Foxer of the role with at least one completed booking in the window,
   * best first. Ties share a position (1, 1, 3). Ordered by name then id
   * within a tie so the list does not shuffle between requests.
   */
  static async mostBooked(
    role: LeaderboardRole,
    window: Window,
    city: string | null,
  ): Promise<LeaderboardRow[]> {
    const cfg = ROLE_CONFIG[role];
    const rows = await prisma.$queryRaw<
      {
        position: number;
        userId: string;
        name: string;
        username: string | null;
        image: string | null;
        city: string | null;
        level: number | null;
        path: string | null;
      }[]
    >(Prisma.sql`
      WITH counts AS (${cfg.counts(window)})
      SELECT RANK() OVER (ORDER BY c."n" DESC)::int AS "position",
             u."id" AS "userId",
             u."name" AS "name",
             u."username" AS "username",
             u."image" AS "image",
             u."city" AS "city",
             best."level" AS "level",
             best."path" AS "path"
        FROM counts c
        JOIN "users" u ON u."id" = c."userId"
        LEFT JOIN LATERAL (
          SELECT pp."level" AS "level", pp."path"::text AS "path"
            FROM "passports" p
            JOIN "passport_paths" pp ON pp."passportId" = p."id"
           WHERE p."userId" = u."id"
             AND pp."path"::text = ANY(${cfg.paths}::text[])
           ORDER BY pp."level" DESC
           LIMIT 1
        ) best ON TRUE
       WHERE u."roleType"::text[] && ${cfg.roles}::text[]
         AND (${city}::text IS NULL OR lower(u."city") = lower(${city}::text))
       ORDER BY c."n" DESC, u."name" ASC, u."id" ASC`);

    return rows.map((r) => ({
      position: r.position,
      userId: r.userId,
      name: r.name,
      username: r.username,
      image: r.image,
      city: r.city,
      level: r.level ?? 1,
      path: r.path ?? cfg.paths[0],
    }));
  }
}
