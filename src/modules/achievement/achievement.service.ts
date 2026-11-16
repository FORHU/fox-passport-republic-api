import {
  AchievementDefinition,
  AchievementProgress,
  UserAchievementsResponse,
} from "./achievement.types";
import {
  CITIZEN_ACHIEVEMENTS,
  FOXER_ACHIEVEMENTS,
} from "./achievement.constants";
import {
  AchievementRepo,
  CitizenCounters,
  FoxerCounters,
} from "./achievement.repository";
import PassportSvc from "../passport/passport.service";

export class AchievementSvc {
  /**
   * Evaluates an individual achievement against a numeric counter, computes
   * tier progress, and automatically awards newly achieved tier rewards.
   */
  static async evaluateAchievement(
    userId: string,
    def: AchievementDefinition,
    currentCount: number,
  ): Promise<AchievementProgress> {
    const [t1, t2, t3] = def.tiers;

    let currentTier: 0 | 1 | 2 | 3 = 0;
    if (currentCount >= t3.target) {
      currentTier = 3;
    } else if (currentCount >= t2.target) {
      currentTier = 2;
    } else if (currentCount >= t1.target) {
      currentTier = 1;
    }

    const nextTier: 1 | 2 | 3 | null =
      currentTier === 3 ? null : ((currentTier + 1) as 1 | 2 | 3);

    const targetCount =
      nextTier === 1 ? t1.target : nextTier === 2 ? t2.target : t3.target;

    const progressPercentage = Math.min(
      100,
      Math.round((currentCount / targetCount) * 100),
    );

    // Unlocked tiers keep their badges, and badges only. Reading used to pay
    // each tier's Coins here, which double-paid what milestones now pay (RR-6)
    // and paid Foxers Tokens they cannot earn. Tokens for these actions come
    // from MilestoneSvc.reconcile, on the event itself, never from a read. A
    // badge award is an upsert, so repeating it on every read is safe.
    for (const t of def.tiers) {
      if (currentCount >= t.target && t.badgeName) {
        await PassportSvc.awardBadgeByName(userId, t.badgeName).catch(() => {});
      }
    }

    return {
      key: def.key,
      name: def.name,
      description: def.description,
      category: def.category,
      currentCount,
      currentTier,
      nextTier,
      targetCount,
      progressPercentage,
      isCompleted: currentTier === 3,
      tiers: def.tiers.map((t) => ({
        tier: t.tier,
        target: t.target,
        xp: t.xp,
        // Nothing here pays Tokens any more; 0 keeps the apps from promising any.
        coins: 0,
        badgeName: t.badgeName,
        isUnlocked: currentCount >= t.target,
      })),
    };
  }

  /**
   * Map citizen counters to definition keys
   */
  private static getCitizenMetric(
    key: string,
    counters: CitizenCounters,
  ): number {
    switch (key) {
      case "regular":
        return counters.attendedEvents;
      case "stamp_collector":
        return counters.distinctVenues;
      case "city_hopper":
        return counters.distinctCities;
      case "critic":
        return counters.reviews;
      case "storyteller":
        return counters.posts;
      case "conversationalist":
        return counters.comments;
      case "crowd_favorite":
        return counters.likesReceived;
      default:
        return 0;
    }
  }

  /**
   * Map Foxer counters to definition keys
   */
  private static getFoxerMetric(key: string, counters: FoxerCounters): number {
    switch (key) {
      case "open_for_business":
        return counters.listings;
      case "fully_booked":
        return counters.completedBookings;
      case "five_stars":
        return counters.fiveStarReviews;
      case "quick_responder":
        return counters.quickReplies;
      case "reliable":
        return counters.reliableBookings;
      default:
        return 0;
    }
  }

  /**
   * Retrieves live progress across all achievements for a given user.
   */
  static async getUserAchievements(
    userId: string,
  ): Promise<UserAchievementsResponse> {
    const [citizenCounters, foxerCounters] = await Promise.all([
      AchievementRepo.getCitizenCounters(userId),
      AchievementRepo.getFoxerCounters(userId),
    ]);

    const citizenPromises = CITIZEN_ACHIEVEMENTS.map((def) => {
      const count = this.getCitizenMetric(def.key, citizenCounters);
      return this.evaluateAchievement(userId, def, count);
    });

    const foxerPromises = FOXER_ACHIEVEMENTS.map((def) => {
      const count = this.getFoxerMetric(def.key, foxerCounters);
      return this.evaluateAchievement(userId, def, count);
    });

    const [citizenAchievements, foxerAchievements] = await Promise.all([
      Promise.all(citizenPromises),
      Promise.all(foxerPromises),
    ]);

    const allProgress = [...citizenAchievements, ...foxerAchievements];
    const totalUnlockedTiers = allProgress.reduce(
      (sum, p) => sum + p.currentTier,
      0,
    );
    const completedAchievements = allProgress.filter(
      (p) => p.isCompleted,
    ).length;

    return {
      citizenAchievements,
      foxerAchievements,
      totalUnlockedTiers,
      completedAchievements,
    };
  }
}
