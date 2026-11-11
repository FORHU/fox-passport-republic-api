import { describe, it, expect, vi, beforeEach } from "vitest";
import LeaderboardService, {
  pawsRankingScore,
} from "../src/modules/leaderboard/leaderboard.service";
import LeaderboardRepo from "../src/modules/leaderboard/leaderboard.repository";
import FoxerScoreService from "../src/modules/foxer-score/foxer-score.service";

vi.mock("../src/modules/leaderboard/leaderboard.repository", () => ({
  default: {
    getCitizenAllTime: vi.fn(),
    getCitizenSeasonal: vi.fn(),
    getUserCitizenStanding: vi.fn(),
    getFoxersForRanking: vi.fn(),
  },
}));

vi.mock("../src/modules/foxer-score/foxer-score.service", () => ({
  default: {
    computeFoxerScore: vi.fn(),
  },
}));

vi.mock("../src/modules/foxer-score/foxer-score.repository", () => ({
  default: {
    // Platform average used as C in the Paws ranking
    getPlatformAvgRating: vi.fn(async () => 4.5),
  },
}));

vi.mock("../src/utils/cache.util", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/utils/cache.util")>();
  return {
    ...actual,
    cached: vi.fn((_key, _ttl, fn) => fn()),
  };
});

describe("Leaderboards Engine (Specification §8)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Citizen Leaderboard (§8.1)", () => {
    const mockCitizens = [
      {
        userId: "user-1",
        name: "Alice",
        avatarUrl: "https://example.com/alice.jpg",
        city: "Manila",
        level: 15,
        totalXP: 5400,
      },
      {
        userId: "user-2",
        name: "Bob",
        avatarUrl: null,
        city: "Cebu",
        level: 10,
        totalXP: 2500,
      },
    ];

    it("ranks all_time citizens and strictly protects XP privacy", async () => {
      vi.mocked(LeaderboardRepo.getCitizenAllTime).mockResolvedValue(
        mockCitizens as any,
      );

      const res = await LeaderboardService.getCitizenLeaderboard(
        "user-1",
        "all_time",
      );

      expect(res.entries).toHaveLength(2);
      expect(res.entries[0]).toEqual({
        position: 1,
        userId: "user-1",
        name: "Alice",
        avatarUrl: "https://example.com/alice.jpg",
        level: 15,
        rankTitle: "Voyager",
        city: "Manila",
      });

      // Strict privacy check: totalXP or seasonalXP must NEVER leak in response entries
      expect((res.entries[0] as any).totalXP).toBeUndefined();
      expect((res.entries[0] as any).seasonalXP).toBeUndefined();
      expect(res.userPosition?.position).toBe(1);
    });

    it("pins requesting user standing when outside top entries", async () => {
      vi.mocked(LeaderboardRepo.getCitizenSeasonal).mockResolvedValue(
        mockCitizens as any,
      );
      vi.mocked(LeaderboardRepo.getUserCitizenStanding).mockResolvedValue({
        userId: "user-outside",
        name: "Outside Citizen",
        avatarUrl: null,
        city: "Davao",
        level: 3,
        totalXP: 300,
      } as any);

      const res = await LeaderboardService.getCitizenLeaderboard(
        "user-outside",
        "this_month",
      );

      expect(res.entries).toHaveLength(2);
      expect(res.userPosition).toBeDefined();
      expect(res.userPosition?.userId).toBe("user-outside");
      expect(res.userPosition?.position).toBe(3);
      expect(res.userPosition?.rankTitle).toBe("Wanderer");
      expect((res.userPosition as any).totalXP).toBeUndefined();
    });
  });

  describe("Foxer Leaderboard (§8.2)", () => {
    const mockFoxers = [
      {
        id: "foxer-1",
        name: "Host Pro",
        image: null,
        city: "Manila",
        roleType: ["venueFoxer"],
        createdAt: new Date("2026-01-10T00:00:00Z"),
        roleRequests: [{ reviewedAt: new Date("2026-02-01T00:00:00Z") }],
        passport: {
          paths: [{ path: "venueFoxer", level: 12 }],
        },
      },
      {
        id: "foxer-2",
        name: "Host Rookie",
        image: null,
        city: "Manila",
        roleType: ["venueFoxer"],
        createdAt: new Date("2026-03-05T00:00:00Z"),
        roleRequests: [],
        passport: {
          paths: [{ path: "venueFoxer", level: 2 }],
        },
      },
    ];

    it("filters top_rated Foxers requiring minimum 3 completed bookings", async () => {
      vi.mocked(LeaderboardRepo.getFoxersForRanking).mockResolvedValue(
        mockFoxers as any,
      );

      // Foxer 1 has 10 bookings, Foxer 2 only has 1 booking (ineligible for top_rated)
      vi.mocked(FoxerScoreService.computeFoxerScore).mockImplementation(
        async (userId: string) => {
          if (userId === "foxer-1") {
            return {
              foxerScore: 88,
              operationalMetrics: {
                starRating: 4.9,
                avgRating: 4.9,
                rawReviewCount: 15,
                completedBookings: 10,
                isIdentityVerified: true,
              },
            } as any;
          }
          return {
            foxerScore: 95,
            operationalMetrics: {
              starRating: 5.0,
              avgRating: 5.0,
              rawReviewCount: 1,
              completedBookings: 1, // < 3 threshold
              isIdentityVerified: false,
            },
          } as any;
        },
      );

      const res = await LeaderboardService.getFoxerLeaderboard(
        null,
        "top_rated",
        "venueFoxer",
        "Manila",
      );

      expect(res.entries).toHaveLength(1);
      expect(res.entries[0].userId).toBe("foxer-1");
      expect(res.entries[0].position).toBe(1);
      expect(res.entries[0].starRating).toBe(4.9);
      expect(res.entries[0].reviewCount).toBe(15);
      expect(res.entries[0].completedBookings).toBe(10);
      // Paws fields (RR-2), with these names
      expect(res.entries[0]).toMatchObject({
        paws: 4.9,
        foxerSince: "2026-02-01T00:00:00.000Z",
        isVerified: true,
      });
      expect(res.entries[0]).not.toHaveProperty("rankTitle");
    });

    it("ranks Top rated by Paws (Bayesian): 4.9 from 100 reviews beats 5.0 from 1", async () => {
      vi.mocked(LeaderboardRepo.getFoxersForRanking).mockResolvedValue(
        mockFoxers as any,
      );
      vi.mocked(FoxerScoreService.computeFoxerScore).mockImplementation(
        async (userId: string) =>
          ({
            // The Foxer Score no longer decides Top rated
            foxerScore: userId === "foxer-1" ? 60 : 99,
            operationalMetrics:
              userId === "foxer-1"
                ? {
                    starRating: 4.9,
                    avgRating: 4.9,
                    rawReviewCount: 100,
                    completedBookings: 100,
                    isIdentityVerified: true,
                  }
                : {
                    starRating: 5.0,
                    avgRating: 5.0,
                    rawReviewCount: 1,
                    completedBookings: 5,
                    isIdentityVerified: true,
                  },
          }) as any,
      );

      const res = await LeaderboardService.getFoxerLeaderboard(
        null,
        "top_rated",
        "venueFoxer",
      );

      expect(res.entries.map((e) => e.userId)).toEqual(["foxer-1", "foxer-2"]);
      // Fewer than 5 reviews shows "New": no Paws
      expect(res.entries[1].paws).toBeNull();
      // No approved role request: falls back to the account's creation
      expect(res.entries[1].foxerSince).toBe("2026-03-05T00:00:00.000Z");
    });

    it("breaks a Paws tie on completed bookings", async () => {
      vi.mocked(LeaderboardRepo.getFoxersForRanking).mockResolvedValue(
        mockFoxers as any,
      );
      vi.mocked(FoxerScoreService.computeFoxerScore).mockImplementation(
        async (userId: string) =>
          ({
            foxerScore: 50,
            operationalMetrics: {
              starRating: 4.7,
              avgRating: 4.7,
              rawReviewCount: 20,
              completedBookings: userId === "foxer-1" ? 4 : 30,
              isIdentityVerified: false,
            },
          }) as any,
      );

      const res = await LeaderboardService.getFoxerLeaderboard(
        null,
        "top_rated",
        "venueFoxer",
      );

      expect(res.entries.map((e) => e.userId)).toEqual(["foxer-2", "foxer-1"]);
    });
  });
});

describe("pawsRankingScore", () => {
  it("pulls a small review count towards the platform average", () => {
    // 5.0 from 1 review with prior 5 and C = 4.5: (1x5 + 5x4.5) / 6
    expect(pawsRankingScore(1, 5, 4.5, 5)).toBeCloseTo(4.583, 3);
    // 4.9 from 100 reviews stays close to 4.9
    expect(pawsRankingScore(100, 4.9, 4.5, 5)).toBeCloseTo(4.881, 3);
    // No reviews and no prior: the platform average
    expect(pawsRankingScore(0, 0, 4.5, 0)).toBe(4.5);
  });
});
