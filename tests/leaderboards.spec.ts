import { describe, it, expect, vi, beforeEach } from "vitest";
import LeaderboardService from "../src/modules/leaderboard/leaderboard.service";
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
        createdAt: new Date(),
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
        createdAt: new Date(),
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
                rawReviewCount: 15,
                completedBookings: 10,
              },
            } as any;
          }
          return {
            foxerScore: 95,
            operationalMetrics: {
              starRating: 5.0,
              rawReviewCount: 1,
              completedBookings: 1, // < 3 threshold
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
    });
  });
});
