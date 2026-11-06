import { UserPath } from "@prisma/client";
import { AppError } from "../../utils/errors";
import { cached } from "../../utils/cache.util";
import RankSvc from "../passport/rank.service";
import LeaderboardRepo, {
  LEADERBOARD_ROLES,
  LeaderboardRole,
  LeaderboardRow,
  Window,
} from "./leaderboard.repository";

/** Manila is UTC+8 all year; the month turns over there, not in UTC. */
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/** How long a board is served before it is worked out again. */
const BOARD_TTL_SECONDS = 120;

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_CITY_LENGTH = 80;

/** The tabs that exist so far. Top rated and Rising need the Foxer Score. */
const TABS = ["most_booked"] as const;
type Tab = (typeof TABS)[number];

/**
 * The calendar month `now` falls in, in Manila time, as the instants it
 * starts and ends and a `YYYY-MM` label. The window is `[from, to)`.
 */
export function manilaMonthWindow(now: Date): Window & { month: string } {
  const manila = new Date(now.getTime() + MANILA_OFFSET_MS);
  const year = manila.getUTCFullYear();
  const monthIndex = manila.getUTCMonth();
  return {
    from: new Date(Date.UTC(year, monthIndex, 1) - MANILA_OFFSET_MS),
    to: new Date(Date.UTC(year, monthIndex + 1, 1) - MANILA_OFFSET_MS),
    month: `${year}-${String(monthIndex + 1).padStart(2, "0")}`,
  };
}

export interface FoxerBoardEntry {
  position: number;
  userId: string;
  name: string;
  username: string | null;
  image: string | null;
  city: string | null;
  role: LeaderboardRole;
  rank: { number: number; name: string; rarity: string };
  isMe: boolean;
}

export interface FoxerBoard {
  tab: Tab;
  role: LeaderboardRole;
  city: string | null;
  /** The Manila month the board counts, as `YYYY-MM`. */
  month: string;
  rows: FoxerBoardEntry[];
  /** The caller's own place, even when it is below the rows; null if absent. */
  me: FoxerBoardEntry | null;
}

export default class LeaderboardSvc {
  static isRole(value: string): value is LeaderboardRole {
    return (LEADERBOARD_ROLES as readonly string[]).includes(value);
  }

  private static toEntry(
    row: LeaderboardRow,
    role: LeaderboardRole,
    viewerId: string,
  ): FoxerBoardEntry {
    const rank = RankSvc.forLevel(row.level, row.path as UserPath);
    return {
      position: row.position,
      userId: row.userId,
      name: row.name,
      username: row.username,
      image: row.image,
      city: row.city,
      role,
      rank: { number: rank.number, name: rank.name, rarity: rank.rarity },
      isMe: row.userId === viewerId,
    };
  }

  /**
   * The Foxer leaderboard for a role, ranked by completed bookings this month.
   * Counts never leave the server: a row carries a position and a rank, not
   * how many bookings it took.
   */
  static async foxers(params: {
    viewerId: string;
    role: string;
    tab?: string;
    city?: string;
    limit?: number;
    now?: Date;
  }): Promise<FoxerBoard> {
    if (!LeaderboardSvc.isRole(params.role)) {
      throw new AppError(
        `role must be one of: ${LEADERBOARD_ROLES.join(", ")}`,
        400,
      );
    }
    const tab = params.tab ?? "most_booked";
    if (!(TABS as readonly string[]).includes(tab)) {
      throw new AppError(
        `tab "${tab}" is not available yet; use: ${TABS.join(", ")}`,
        400,
      );
    }

    const city = params.city?.trim() || null;
    if (city && city.length > MAX_CITY_LENGTH) {
      throw new AppError("city is too long", 400);
    }
    const limit = Math.min(
      Math.max(1, Math.trunc(params.limit ?? DEFAULT_LIMIT)),
      MAX_LIMIT,
    );

    const window = manilaMonthWindow(params.now ?? new Date());
    const role = params.role;
    const all = await cached(
      `leaderboard:foxers:${tab}:${role}:${(city ?? "").toLowerCase()}:${window.month}`,
      BOARD_TTL_SECONDS,
      () => LeaderboardRepo.mostBooked(role, window, city),
    );

    const mine = all.find((r) => r.userId === params.viewerId);
    return {
      tab: tab as Tab,
      role,
      city,
      month: window.month,
      rows: all
        .slice(0, limit)
        .map((r) => LeaderboardSvc.toEntry(r, role, params.viewerId)),
      me: mine ? LeaderboardSvc.toEntry(mine, role, params.viewerId) : null,
    };
  }
}
