import FoxerScoreRepo from "./foxer-score.repository";

export interface FoxerScoreBreakdown {
  ratingScore: number; // 0 to 45
  volumeScore: number; // 0 to 20
  responsivenessScore: number; // 0 to 15
  reliabilityScore: number; // 0 to 15
  trustScore: number; // 0 to 5
}

export interface FoxerOperationalMetrics {
  starRating: number;
  rawReviewCount: number;
  isNew: boolean;
  bayesianRating: number;
  completedBookings: number;
  responsivenessRate: number;
  cancellationRate: number;
  isIdentityVerified: boolean;
  foxerLevel: number;
}

export interface FoxerScoreResult {
  foxerScore: number; // 0 to 100
  breakdown: FoxerScoreBreakdown;
  operationalMetrics: FoxerOperationalMetrics;
}

/** Where a Foxer stands on their own leaderboard, for "#3 Venues in Manila". */
export interface FoxerLeaderboardPlace {
  position: number;
  role: string;
  city: string | null;
}

export interface PublicFoxerProfileReputation {
  starRating: number | null;
  reviewCount: number;
  isNew: boolean;
  completedBookings: number;
  responseRatePercent: number;
  cancellationRatePercent: number;
  isIdentityVerified: boolean;
  labels: string[];
  /** Null when they are not on a board: outside the top 50, or too new. */
  leaderboard: FoxerLeaderboardPlace | null;
}

/**
 * The role whose board a Foxer is placed on, when they hold several: the first
 * of these they have. Null for someone who holds none of them.
 */
const BOARD_ROLES = ["venueFoxer", "eventFoxer", "providerFoxer"] as const;

export function pickLeaderboardRole(
  roleTypes: readonly string[],
): string | null {
  return BOARD_ROLES.find((r) => roleTypes.includes(r)) ?? null;
}

/**
 * Pure calculation functions for Foxer Score parts (requirements/xp-and-coins.md, section 9.1).
 */
export function calculateRatingScore(
  v: number,
  R: number,
  C = 4.5,
): { ratingScore: number; bayesianRating: number } {
  const bayesianRating = v === 0 ? C : (v * R + 5 * C) / (v + 5);
  // Scale from 1 to 5 stars onto 0 to 45
  const rawScore = ((bayesianRating - 1) / 4) * 45;
  const ratingScore = Math.min(45, Math.max(0, Math.round(rawScore * 10) / 10));
  return {
    ratingScore,
    bayesianRating: Math.round(bayesianRating * 100) / 100,
  };
}

export function calculateVolumeScore(completedBookings: number): number {
  if (completedBookings <= 0) return 0;
  // Completed bookings on a log scale, full marks at 100
  const score = (Math.log10(completedBookings + 1) / Math.log10(101)) * 20;
  return Math.min(20, Math.max(0, Math.round(score * 10) / 10));
}

export function calculateResponsivenessScore(
  totalRequests: number,
  answeredWithin24h: number,
): { responsivenessScore: number; responsivenessRate: number } {
  if (totalRequests === 0) {
    return { responsivenessScore: 15, responsivenessRate: 1.0 };
  }
  const rate = Math.min(1, Math.max(0, answeredWithin24h / totalRequests));
  const score = Math.round(rate * 15 * 10) / 10;
  return {
    responsivenessScore: Math.min(15, Math.max(0, score)),
    responsivenessRate: Math.round(rate * 100) / 100,
  };
}

export function calculateReliabilityScore(
  totalRecent: number,
  cancelledCount: number,
): { reliabilityScore: number; cancellationRate: number } {
  if (totalRecent === 0) {
    return { reliabilityScore: 15, cancellationRate: 0 };
  }
  const cancellationRate = Math.min(
    1,
    Math.max(0, cancelledCount / totalRecent),
  );
  const score = Math.round((1 - cancellationRate) * 15 * 10) / 10;
  return {
    reliabilityScore: Math.min(15, Math.max(0, score)),
    cancellationRate: Math.round(cancellationRate * 100) / 100,
  };
}

export function calculateTrustScore(
  isIdentityVerified: boolean,
  foxerLevel: number,
): number {
  const identityPart = isIdentityVerified ? 3 : 0;
  const rankPart = Math.min(
    2,
    Math.max(0, ((Math.max(1, foxerLevel) - 1) / 49) * 2),
  );
  return Math.round((identityPart + rankPart) * 10) / 10;
}

export default class FoxerScoreService {
  /**
   * Computes the complete internal Foxer Score (0 to 100) and operational metrics.
   */
  static async computeFoxerScore(userId: string): Promise<FoxerScoreResult> {
    const [
      reviewStats,
      platformAvg,
      completedBookings,
      responsivenessStats,
      reliabilityStats,
      trustFactors,
    ] = await Promise.all([
      FoxerScoreRepo.getFoxerReviewStats(userId),
      FoxerScoreRepo.getPlatformAvgRating(),
      FoxerScoreRepo.getCompletedBookingsCount(userId),
      FoxerScoreRepo.getResponsivenessStats(userId),
      FoxerScoreRepo.getRecentBookingsReliability(userId),
      FoxerScoreRepo.getTrustFactors(userId),
    ]);

    const { ratingScore, bayesianRating } = calculateRatingScore(
      reviewStats.reviewCount,
      reviewStats.avgRating,
      platformAvg,
    );

    const volumeScore = calculateVolumeScore(completedBookings);

    const { responsivenessScore, responsivenessRate } =
      calculateResponsivenessScore(
        responsivenessStats.totalRequests,
        responsivenessStats.answeredWithin24h,
      );

    const { reliabilityScore, cancellationRate } = calculateReliabilityScore(
      reliabilityStats.totalRecent,
      reliabilityStats.cancelledCount,
    );

    const trustScore = calculateTrustScore(
      trustFactors.isVerified,
      trustFactors.foxerLevel,
    );

    const compositeTotal =
      ratingScore +
      volumeScore +
      responsivenessScore +
      reliabilityScore +
      trustScore;

    const foxerScore = Math.min(100, Math.max(0, Math.round(compositeTotal)));

    return {
      foxerScore,
      breakdown: {
        ratingScore,
        volumeScore,
        responsivenessScore,
        reliabilityScore,
        trustScore,
      },
      operationalMetrics: {
        starRating: Math.round(reviewStats.avgRating * 10) / 10,
        rawReviewCount: reviewStats.reviewCount,
        isNew: reviewStats.reviewCount < 5,
        bayesianRating,
        completedBookings,
        responsivenessRate,
        cancellationRate,
        isIdentityVerified: trustFactors.isVerified,
        foxerLevel: trustFactors.foxerLevel,
      },
    };
  }

  /**
   * Builds the transparent public reputation profile for citizens.
   * If fewer than 5 reviews exist, displays "isNew: true" and starRating as null.
   */
  static async getPublicReputation(
    userId: string,
  ): Promise<PublicFoxerProfileReputation> {
    const result = await this.computeFoxerScore(userId);
    const { operationalMetrics, foxerScore } = result;

    const labels: string[] = [];
    if (foxerScore >= 85) labels.push("Top rated");
    if (operationalMetrics.responsivenessRate >= 0.9)
      labels.push("Fast responder");
    if (operationalMetrics.cancellationRate <= 0.05) labels.push("Reliable");
    if (operationalMetrics.isNew && operationalMetrics.completedBookings >= 3)
      labels.push("Rising");

    const leaderboard = await this.findLeaderboardPlace(userId);

    return {
      starRating: operationalMetrics.isNew
        ? null
        : operationalMetrics.starRating,
      reviewCount: operationalMetrics.rawReviewCount,
      isNew: operationalMetrics.isNew,
      completedBookings: operationalMetrics.completedBookings,
      responseRatePercent: Math.round(
        operationalMetrics.responsivenessRate * 100,
      ),
      cancellationRatePercent: Math.round(
        operationalMetrics.cancellationRate * 100,
      ),
      isIdentityVerified: operationalMetrics.isIdentityVerified,
      labels,
      leaderboard,
    };
  }

  /**
   * Their place on the Top rated board for their role in their city, from the
   * cached board, so it costs no scoring of its own. Null when they are not
   * among the 50 on it. Never fails the reputation: a board that cannot be
   * read leaves the place out.
   */
  private static async findLeaderboardPlace(
    userId: string,
  ): Promise<FoxerLeaderboardPlace | null> {
    try {
      const place = await FoxerScoreRepo.getUserPlace(userId);
      const role = place ? pickLeaderboardRole(place.roleType) : null;
      if (!place || !role) return null;

      // Loaded when needed: the leaderboard module itself uses this one.
      const { default: LeaderboardService } =
        await import("../leaderboard/leaderboard.service");
      const city = place.city?.trim() || null;
      const board = await LeaderboardService.getFoxerLeaderboard(
        null,
        "top_rated",
        role,
        city ?? undefined,
      );
      const mine = board.entries.find((e) => e.userId === userId);
      return mine ? { position: mine.position, role, city } : null;
    } catch {
      return null;
    }
  }
}
