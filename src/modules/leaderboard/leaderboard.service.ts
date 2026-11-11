import { cached } from "../../utils/cache.util";
import { UserPath } from "@prisma/client";
import {
  FoxerLeaderboardTab,
  FoxerLeaderboardResponse,
  FoxerLeaderboardEntry,
} from "./leaderboard.types";
import LeaderboardRepo from "./leaderboard.repository";
import RewardService from "../reward/reward.service";
import FoxerScoreService from "../foxer-score/foxer-score.service";

const LEADERBOARD_CACHE_TTL = 300; // 5 minutes cache

export class LeaderboardService {
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
