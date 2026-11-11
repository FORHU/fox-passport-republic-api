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
