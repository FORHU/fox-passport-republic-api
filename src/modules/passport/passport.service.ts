import { UserPath } from "@prisma/client";
import { cached } from "../../utils/cache.util";
import { passportCache, PASSPORT_TTL } from "../../utils/cache-namespaces";
import PassportRepo from "./passport.repository";
import RewardRepo from "../reward/reward.repository";

/** What a passport path and a stamp no longer reveal to a client. */
const RETIRED_PATH_FIELDS = ["level", "currentXP", "totalXP"] as const;
const RETIRED_STAMP_FIELDS = ["xpEarned"] as const;

function without(item: object, keys: readonly string[]) {
  const copy: Record<string, unknown> = { ...item };
  for (const key of keys) delete copy[key];
  return copy;
}

// 9-Rank Ladder thresholds with rank-up Coins bonuses (requirements/xp-and-coins.md, section 4.2)
export interface RankThreshold {
  level: number;
  citizenRank: string;
  foxerRank: string;
  coins: number;
}

export const RANK_THRESHOLDS: readonly RankThreshold[] = [
  { level: 3, citizenRank: "Wanderer", foxerRank: "Regular", coins: 50 },
  { level: 5, citizenRank: "Explorer", foxerRank: "Pro", coins: 100 },
  { level: 10, citizenRank: "Trailblazer", foxerRank: "Veteran", coins: 200 },
  { level: 15, citizenRank: "Voyager", foxerRank: "Headliner", coins: 300 },
  { level: 20, citizenRank: "Adventurer", foxerRank: "Maestro", coins: 500 },
  { level: 30, citizenRank: "Pioneer", foxerRank: "Icon", coins: 800 },
  { level: 40, citizenRank: "Vanguard", foxerRank: "Luminary", coins: 1200 },
  { level: 50, citizenRank: "Legend", foxerRank: "Legend", coins: 2000 },
] as const;

// Level curve (requirements/xp-and-coins.md, section 4.1): the XP that takes a
// player from level `i` to `i + 1` is `XP_PER_LEVEL * XP_MULTIPLIER^(i - 1)`,
// and stops growing at level `XP_COST_CAP_LEVEL`, so every level from there on
// costs the same. Adventurer (level 20) needs 15,860 XP and Legend (50)
// 124,414. The earlier 1000 * 1.15^(i - 1) with no cap needed 88,211 and
// 6,275,408, which left every rank past level 10 out of reach.
const XP_PER_LEVEL = 250;
const XP_MULTIPLIER = 1.12;
const XP_COST_CAP_LEVEL = 25;

// Perk keys granted per path at specific level thresholds.
// Order matters — lower levels first.
export const PERK_THRESHOLDS: Record<
  string,
  { level: number; perk: string }[]
> = {
  [UserPath.user]: [
    { level: 1, perk: "early_bird" },
    { level: 5, perk: "priority_access" },
    { level: 10, perk: "vip_lounge" },
    { level: 15, perk: "founding_citizen" },
  ],
  [UserPath.eventFoxer]: [
    { level: 1, perk: "host_support" },
    { level: 5, perk: "analytics_pro" },
    { level: 10, perk: "featured_listing" },
    { level: 15, perk: "event_boost" },
  ],
  [UserPath.venueFoxer]: [
    { level: 1, perk: "venue_authority" },
    { level: 3, perk: "city_badge" },
    { level: 8, perk: "venue_spotlight" },
    { level: 15, perk: "mayor_verified" },
  ],
  [UserPath.providerFoxer]: [
    { level: 1, perk: "provider_verified" },
    { level: 3, perk: "lower_fees" },
    { level: 8, perk: "provider_featured" },
  ],
};

// XP earned per action (mirrors FE constants)
const XP_REWARDS = {
  bookEvent: 50,
  attendEvent: 100,
  leaveReview: 25,
  createListing: 100,
  listingBooked: 150,
  completeEvent: 200,
  receive5StarReview: 50,
  uploadVenue: 75,
  venueBooked: 100,
  mayorVenueApproved: 200,
  createCommunityPost: 15,
  shareReviewPost: 20,
};

/** Total XP at which `level` starts. */
export function xpRequiredForLevel(level: number): number {
  if (level <= 1) return 0;
  let total = 0;
  for (let i = 1; i < level; i++) {
    const step = Math.min(i, XP_COST_CAP_LEVEL);
    total += Math.round(XP_PER_LEVEL * Math.pow(XP_MULTIPLIER, step - 1));
  }
  return total;
}

export function calculateLevel(totalXP: number): {
  level: number;
  currentXP: number;
  requiredXP: number;
} {
  let level = 1;
  while (totalXP >= xpRequiredForLevel(level + 1)) {
    level++;
  }
  const levelStart = xpRequiredForLevel(level);
  const levelEnd = xpRequiredForLevel(level + 1);
  return {
    level,
    currentXP: totalXP - levelStart,
    requiredXP: levelEnd - levelStart,
  };
}

export default class PassportSvc {
  /**
   * The full badge catalogue, ordered the way the passport screen renders it.
   *
   * Moved verbatim out of `passport.controller.ts`; the query itself now lives
   * in `PassportRepo`, which this module went without until 10 Sep.
   */
  static async getAllBadges() {
    // The badge catalogue is reference data - it changes when someone ships a
    // migration, not when anyone uses the site - so it is cached on its own key
    // for an hour, outside the versioned namespace that XP keeps retiring.
    return cached("passport:badges", 60 * 60, () =>
      PassportRepo.findAllBadges(),
    );
  }

  static async getOrCreate(userId: string) {
    return PassportRepo.upsertPassport(userId);
  }

  /**
   * XP, levels and ranks are retired. The passport keeps each path but not what
   * measured progress along it: level, currentXP and totalXP, and a stamp keeps
   * no xpEarned. The data stays in
   * the database; it is just never sent.
   */
  static withoutXp<T extends { paths: object[]; stamps?: object[] }>(
    passport: T,
  ) {
    return {
      ...passport,
      paths: passport.paths.map((p) => without(p, RETIRED_PATH_FIELDS)),
      ...(passport.stamps
        ? {
            stamps: passport.stamps.map((s) =>
              without(s, RETIRED_STAMP_FIELDS),
            ),
          }
        : {}),
    };
  }

  static async getByUserId(userId: string) {
    return passportCache.cached(`byUser:${userId}`, PASSPORT_TTL, () =>
      PassportRepo.findByUserId(userId),
    );
  }

  // Idempotent badge award — skips silently if badge not found or already earned.
  static async awardBadgeByName(userId: string, badgeName: string) {
    const badge = await PassportRepo.findBadgeByName(badgeName);
    if (!badge) return;
    const passport = await PassportSvc.getOrCreate(userId);
    await PassportRepo.upsertUserBadge(passport.id, badge.id);
  }

  /** @deprecated XP is retired (RR-1, api#298); nothing calls this. Removed with the rank code. */
  static async awardXP(userId: string, path: UserPath, amount: number) {
    const passport = await PassportSvc.getOrCreate(userId);

    const existing = passport.paths.find((p) => p.path === path);
    const prevLevel = existing?.level ?? 1;
    const newTotalXP = Math.max(0, (existing?.totalXP ?? 0) + amount);
    const { level, currentXP, requiredXP } = calculateLevel(newTotalXP);

    await PassportRepo.upsertPath({
      passportId: passport.id,
      path,
      level,
      currentXP,
      totalXP: newTotalXP,
    });

    // Grant perks for every threshold crossed on this path
    if (level !== prevLevel) {
      const thresholds = PERK_THRESHOLDS[path] ?? [];
      const newlyUnlocked = thresholds
        .filter((t) => t.level > prevLevel && t.level <= level)
        .map((t) => t.perk);

      if (newlyUnlocked.length > 0) {
        // Push only perks not already in the array (idempotent)
        const current = await PassportRepo.findPerksById(passport.id);
        const existing = current?.perks ?? [];
        const toAdd = newlyUnlocked.filter((p) => !existing.includes(p));
        if (toAdd.length > 0) {
          await PassportRepo.pushPerks(passport.id, toAdd);
        }
      }
    }

    // Seed Lvl-1 perks on first XP award for a path (prevLevel stays 1 but existing=0 XP)
    if (prevLevel === 1 && (existing?.totalXP ?? 0) === 0) {
      const lvl1Perk = PERK_THRESHOLDS[path]?.find((t) => t.level === 1)?.perk;
      if (lvl1Perk) {
        const current = await PassportRepo.findPerksById(passport.id);
        if (!(current?.perks ?? []).includes(lvl1Perk)) {
          await PassportRepo.pushPerks(passport.id, [lvl1Perk]);
        }
      }
      // Award starter rank badge
      const starterBadge = path === UserPath.user ? "Newcomer" : "Rookie";
      PassportSvc.awardBadgeByName(userId, starterBadge).catch(() => {});
    }

    // Award level-based badges when crossing thresholds
    if (level !== prevLevel && path === UserPath.venueFoxer) {
      if (prevLevel < 3 && level >= 3)
        PassportSvc.awardBadgeByName(userId, "District Champion").catch(
          () => {},
        );
      if (prevLevel < 18 && level >= 18)
        PassportSvc.awardBadgeByName(userId, "Grand Mayor").catch(() => {});
    }

    // Award 9-Rank ladder bonuses (Coins & Badges) when level crosses thresholds
    if (level !== prevLevel) {
      const isCitizen = path === UserPath.user;
      for (const t of RANK_THRESHOLDS) {
        if (t.level > prevLevel && t.level <= level) {
          const rankBadgeName = isCitizen ? t.citizenRank : t.foxerRank;
          PassportSvc.awardBadgeByName(userId, rankBadgeName).catch(() => {});

          if (t.coins > 0) {
            const rankIdempotencyKey = `grant:${userId}:rank_up:${path}:${t.level}`;
            RewardRepo.findEventByIdempotencyKey(rankIdempotencyKey)
              .then(async (existingGrant) => {
                if (!existingGrant) {
                  await RewardRepo.recordGrant({
                    userId,
                    path,
                    action: "rank_up",
                    refType: "rank_level",
                    refId: `${path}:${t.level}`,
                    xp: 0,
                    coins: t.coins,
                    idempotencyKey: rankIdempotencyKey,
                  });
                }
              })
              .catch((err) => {
                console.warn(
                  "[PassportSvc] rank_up bonus coins grant failed:",
                  err,
                );
              });
          }
        }
      }
    }

    return { level, currentXP, requiredXP, totalXP: newTotalXP };
  }

  // Called automatically when a Booking reaches `completed` status.
  // Idempotent — safe to call multiple times (unique constraint on bookingId).
  static async issueStamp(bookingId: string) {
    const booking = await PassportRepo.findBookingForStamp(bookingId);
    if (!booking) return;

    const passport = await PassportSvc.getOrCreate(booking.userId);

    // Idempotent — if stamp already exists for this booking, skip
    const existing = await PassportRepo.findStampByBooking(bookingId);
    if (existing) return;

    // The venue on the stamp must be the one actually confirmed for THIS
    // booking. The scoping that guarantees that is in the repository, with the
    // reason it matters.
    const venueTx = await PassportRepo.findApprovedVenueForBooking(bookingId);

    const venue = venueTx?.venue;
    const venueId = venue?.id ?? null;

    const location =
      [venue?.city ?? booking.event?.targetCity, booking.event?.targetCountry]
        .filter(Boolean)
        .join(", ") || null;

    // Custom venue seal or automatic vintage circular stamp
    const stampLabel = venue?.name ?? booking.event?.name ?? "Fox Passport";
    const stampCity = venue?.city ?? booking.event?.targetCity ?? "Republic";
    const fallbackSeal = `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(
      `${stampLabel}-${stampCity}`,
    )}&backgroundColor=b45309,d97706`;

    const imageUrl = venue?.stampIconUrl || fallbackSeal;

    await PassportRepo.createStamp({
      passportId: passport.id,
      bookingId,
      eventName: booking.event?.name ?? "Event",
      eventDate: booking.startAt,
      location,
      venueId,
      imageUrl,
      xpEarned: XP_REWARDS.attendEvent,
    });

    // Award attend_event XP and Coins via RewardService (enforces booking fee budget)
    try {
      const { default: RewardService } =
        await import("../reward/reward.service");
      await RewardService.grant({
        userId: booking.userId,
        path: UserPath.user,
        action: "attend_event",
        refType: "booking",
        refId: bookingId,
        bookingFeeAmount: Number(booking.event?.platformFeeAmount || 0),
      });
    } catch (grantErr) {
      console.warn("[PassportSvc] attend_event reward grant failed:", grantErr);
    }

    // Milestone Badges: Track distinct venue stamps collected
    try {
      const distinctVenues = await PassportRepo.findDistinctStampVenues(
        passport.id,
      );

      if (distinctVenues.length >= 5) {
        await PassportSvc.awardBadgeByName(booking.userId, "Manila Explorer");
      }
      if (distinctVenues.length >= 10) {
        await PassportSvc.awardBadgeByName(booking.userId, "Venue Connoisseur");
      }
    } catch (badgeErr) {
      console.warn("[PassportSvc] Milestone badge check failed:", badgeErr);
    }
  }

  // Sort a list of items so owners with the given perk appear first.
  // perkPriority: ordered highest→lowest. Items are scored by their highest matching perk.
  static async sortByFeaturedPerk<T extends Record<string, unknown>>(
    items: T[],
    perkPriority: string | string[],
    ownerField = "ownerId",
  ): Promise<T[]> {
    if (items.length === 0) return items;
    const priority = Array.isArray(perkPriority)
      ? perkPriority
      : [perkPriority];
    const ownerIds = [
      ...new Set(items.map((i) => i[ownerField]).filter(Boolean) as string[]),
    ];
    if (ownerIds.length === 0) return items;

    const passports = await PassportRepo.findPerksForUsers(ownerIds);
    const perkMap = new Map(passports.map((p) => [p.userId, p.perks]));

    const score = (item: T) => {
      const ownerId = item[ownerField];
      const perks =
        (typeof ownerId === "string" ? perkMap.get(ownerId) : undefined) ?? [];
      for (let i = 0; i < priority.length; i++) {
        if (perks.includes(priority[i])) return priority.length - i;
      }
      return 0;
    };

    return [...items].sort((a, b) => score(b) - score(a));
  }

  // Check if a user has a specific perk key unlocked
  static async hasPerk(userId: string, perkKey: string): Promise<boolean> {
    // Through `getPerks` so this shares the cached entry rather than opening a
    // second, uncached path to the same row.
    const perks = await PassportSvc.getPerks(userId);
    return perks.includes(perkKey);
  }

  // Enrich a list of items with the highest-priority badge each owner holds.
  // Returns items with an added `ownerBadge: string | null` field.
  static async enrichWithOwnerBadge<T extends Record<string, unknown>>(
    items: T[],
    badgePriority: string | string[],
    ownerField = "ownerId",
  ): Promise<(T & { ownerBadge: string | null })[]> {
    if (items.length === 0)
      return items.map((i) => ({ ...i, ownerBadge: null }));
    const priority = Array.isArray(badgePriority)
      ? badgePriority
      : [badgePriority];
    const ownerIds = [
      ...new Set(items.map((i) => i[ownerField]).filter(Boolean) as string[]),
    ];

    const passports = await PassportRepo.findPerksForUsers(ownerIds);
    const perkMap = new Map(passports.map((p) => [p.userId, p.perks]));

    return items.map((item) => {
      const ownerId = item[ownerField];
      const perks =
        (typeof ownerId === "string" ? perkMap.get(ownerId) : undefined) ?? [];
      const badge = priority.find((b) => perks.includes(b)) ?? null;
      return { ...item, ownerBadge: badge };
    });
  }

  // Return all perk keys for a user
  static async getPerks(userId: string): Promise<string[]> {
    // The hottest read in the module by a wide margin: every listing page calls
    // it once per owner, through `sortByFeaturedPerk` and
    // `enrichWithOwnerBadge`.
    const passport = await passportCache.cached(
      `perks:${userId}`,
      PASSPORT_TTL,
      () => PassportRepo.findPerksByUserId(userId),
    );
    return passport?.perks ?? [];
  }
}

export { XP_REWARDS, UserPath };
