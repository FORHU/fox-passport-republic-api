import { cached } from "../../utils/cache.util";
import { UserPath } from "@prisma/client";
import {
  CitizenLeaderboardTab,
  CitizenLeaderboardResponse,
  CitizenLeaderboardEntry,
  FoxerLeaderboardTab,
  FoxerLeaderboardResponse,
  FoxerLeaderboardEntry,
} from "./leaderboard.types";
import LeaderboardRepo from "./leaderboard.repository";
import RewardService from "../reward/reward.service";
import FoxerScoreService from "../foxer-score/foxer-score.service";

const LEADERBOARD_CACHE_TTL = 300; // 5 minutes cache

interface RawCitizenEntry {
  userId: string;
  name: string;
  avatarUrl: string | null;
  level: number;
  city: string | null;
}

export class LeaderboardService {
  /**
   * Retrieves the Citizen Leaderboard partitioned by this month, all-time, or city.
   * XP amounts remain private (§8.1) — returns position, avatar, name, rank badge and level.
   */
  static async getCitizenLeaderboard(
    userId: string | null,
    tab: CitizenLeaderboardTab = "this_month",
    city?: string,
  ): Promise<CitizenLeaderboardResponse> {
    const now = new Date();
    const season = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const cacheKey = `leaderboard:citizens:${tab}:${season}:${city || "global"}`;

    const rawEntries = await cached(
      cacheKey,
      LEADERBOARD_CACHE_TTL,
      async () => {
        if (tab === "all_time") {
          return LeaderboardRepo.getCitizenAllTime(city, 50);
        }
        return LeaderboardRepo.getCitizenSeasonal(startOfMonth, city, 50);
      },
    );

    const entries: CitizenLeaderboardEntry[] = (
      rawEntries as RawCitizenEntry[]
    ).map((item, idx) => ({
      position: idx + 1,
      userId: item.userId,
      name: item.name,
      avatarUrl: item.avatarUrl,
      level: item.level,
      rankTitle: RewardService.calculateRank(item.level, UserPath.user),
      city: item.city,
    }));

    let userPosition: CitizenLeaderboardEntry | null = null;
    if (userId) {
      const match = entries.find((e) => e.userId === userId);
      if (match) {
        userPosition = match;
      } else {
        const userStanding =
          await LeaderboardRepo.getUserCitizenStanding(userId);
        if (userStanding) {
          userPosition = {
            position: entries.length + 1,
            userId: userStanding.userId,
            name: userStanding.name,
            avatarUrl: userStanding.avatarUrl,
            level: userStanding.level,
            rankTitle: RewardService.calculateRank(
              userStanding.level,
              UserPath.user,
            ),
            city: userStanding.city,
          };
        }
      }
    }

    return {
      entries,
      userPosition,
      tab,
      season,
    };
  }

  /**
   * Retrieves the Foxer Leaderboard partitioned by top rated (Foxer Score),
   * most booked (monthly completed bookings), or rising (30-day delta).
   */
  static async getFoxerLeaderboard(
    userId: string | null,
    tab: FoxerLeaderboardTab = "top_rated",
    role?: string,
    city?: string,
  ): Promise<FoxerLeaderboardResponse> {
    const cacheKey = `leaderboard:foxers:${tab}:${role || "all"}:${city || "all"}`;

    const entries = await cached(cacheKey, LEADERBOARD_CACHE_TTL, async () => {
      const candidates = await LeaderboardRepo.getFoxersForRanking(role, city);

      const scored = await Promise.all(
        candidates.map(async (f) => {
          const scoreResult = await FoxerScoreService.computeFoxerScore(f.id);
          const highestPath = f.passport?.paths.sort(
            (a, b) => b.level - a.level,
          )[0];
          const foxerLevel = highestPath?.level ?? 1;
          const foxerPath = highestPath?.path ?? UserPath.providerFoxer;

          return {
            userId: f.id,
            name: f.name,
            avatarUrl: f.image,
            role: role || (f.roleType[0] ?? "Foxer"),
            city: f.city,
            rankTitle: RewardService.calculateRank(foxerLevel, foxerPath),
            starRating: scoreResult.operationalMetrics.starRating,
            reviewCount: scoreResult.operationalMetrics.rawReviewCount,
            completedBookings: scoreResult.operationalMetrics.completedBookings,
            foxerScore: scoreResult.foxerScore,
            createdAt: f.createdAt,
          };
        }),
      );

      let filtered = scored;

      if (tab === "top_rated") {
        // §8.2: Minimum 3 completed bookings to qualify for Top Rated
        filtered = scored
          .filter((f) => f.completedBookings >= 3)
          .sort((a, b) => b.foxerScore - a.foxerScore);
      } else if (tab === "most_booked") {
        filtered = scored.sort(
          (a, b) => b.completedBookings - a.completedBookings,
        );
      } else if (tab === "rising") {
        // Accounts created within 6 months
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        filtered = scored
          .filter((f) => f.createdAt >= sixMonthsAgo)
          .sort((a, b) => b.foxerScore - a.foxerScore);
      }

      return filtered.slice(0, 50).map((f, idx) => ({
        position: idx + 1,
        userId: f.userId,
        name: f.name,
        avatarUrl: f.avatarUrl,
        role: f.role,
        city: f.city,
        rankTitle: f.rankTitle,
        starRating: f.starRating,
        reviewCount: f.reviewCount,
        completedBookings: f.completedBookings,
      }));
    });

    let userPosition: FoxerLeaderboardEntry | null = null;
    if (userId) {
      const match = (entries as FoxerLeaderboardEntry[]).find(
        (e) => e.userId === userId,
      );
      if (match) {
        userPosition = match;
      }
    }

    return {
      entries: entries as FoxerLeaderboardEntry[],
      userPosition,
      tab,
      role,
      city,
    };
  }
}

export default LeaderboardService;
