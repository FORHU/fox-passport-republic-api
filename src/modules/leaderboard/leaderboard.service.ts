import { cached } from "../../utils/cache.util";
import {
  FoxerLeaderboardTab,
  FoxerLeaderboardResponse,
  FoxerLeaderboardEntry,
} from "./leaderboard.types";
import LeaderboardRepo from "./leaderboard.repository";
import FoxerScoreService from "../foxer-score/foxer-score.service";
import FoxerScoreRepo from "../foxer-score/foxer-score.repository";
import {
  LEADERBOARD_PAWS_PRIOR,
  LEADERBOARD_TOP_RATED_MIN_BOOKINGS,
} from "../../config";

const LEADERBOARD_CACHE_TTL = 300; // 5 minutes cache

/** Fewer reviews than this shows "New" instead of Paws. */
const PAWS_MIN_REVIEWS = 5;

/**
 * Bayesian average used to rank Top rated (rewards spec section 7.2), so one
 * 5-star review can't beat 80 good ones: (v x R + p x C) / (v + p), where R is
 * the Foxer's average, v their review count, C the platform average and p the
 * prior.
 */
export function pawsRankingScore(
  v: number,
  R: number,
  C: number,
  p: number = LEADERBOARD_PAWS_PRIOR,
): number {
  if (v + p === 0) return C;
  return (v * R + p * C) / (v + p);
}

export class LeaderboardService {
  /**
   * Retrieves the Foxer Leaderboard: top rated (Paws, Bayesian), most booked
   * (completed bookings), or rising (Foxers under 6 months, by Foxer Score).
   */
  static async getFoxerLeaderboard(
    userId: string | null,
    tab: FoxerLeaderboardTab = "top_rated",
    role?: string,
    city?: string,
  ): Promise<FoxerLeaderboardResponse> {
    const cacheKey = `leaderboard:foxers:${tab}:${role || "all"}:${city || "all"}`;

    const entries = await cached(cacheKey, LEADERBOARD_CACHE_TTL, async () => {
      const [candidates, platformAvg] = await Promise.all([
        LeaderboardRepo.getFoxersForRanking(role, city),
        FoxerScoreRepo.getPlatformAvgRating(),
      ]);

      const scored = await Promise.all(
        candidates.map(async (f) => {
          const scoreResult = await FoxerScoreService.computeFoxerScore(f.id);
          const m = scoreResult.operationalMetrics;

          return {
            userId: f.id,
            name: f.name,
            avatarUrl: f.image,
            role: role || (f.roleType[0] ?? "Foxer"),
            city: f.city,
            paws: m.rawReviewCount < PAWS_MIN_REVIEWS ? null : m.starRating,
            starRating: m.starRating,
            reviewCount: m.rawReviewCount,
            completedBookings: m.completedBookings,
            foxerSince: (
              f.roleRequests[0]?.reviewedAt ?? f.createdAt
            ).toISOString(),
            isVerified: m.isIdentityVerified,
            pawsScore: pawsRankingScore(
              m.rawReviewCount,
              m.avgRating,
              platformAvg,
            ),
            foxerScore: scoreResult.foxerScore,
            createdAt: f.createdAt,
          };
        }),
      );

      let filtered = scored;

      if (tab === "top_rated") {
        // Ranked by Paws (Bayesian), ties on completed bookings; a minimum of
        // completed bookings to appear (rewards spec section 7.2).
        filtered = scored
          .filter(
            (f) => f.completedBookings >= LEADERBOARD_TOP_RATED_MIN_BOOKINGS,
          )
          .sort(
            (a, b) =>
              b.pawsScore - a.pawsScore ||
              b.completedBookings - a.completedBookings,
          );
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
        paws: f.paws,
        starRating: f.starRating,
        reviewCount: f.reviewCount,
        completedBookings: f.completedBookings,
        foxerSince: f.foxerSince,
        isVerified: f.isVerified,
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
