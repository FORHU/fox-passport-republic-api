import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  place: null as null | { city: string | null; roleType: string[] },
  entries: [] as { userId: string; position: number }[],
  boardFails: false,
}));

vi.mock("../src/modules/foxer-score/foxer-score.repository", () => ({
  default: {
    getFoxerReviewStats: vi.fn(async () => ({
      reviewCount: 40,
      avgRating: 4.8,
    })),
    getPlatformAvgRating: vi.fn(async () => 4.5),
    getCompletedBookingsCount: vi.fn(async () => 62),
    getResponsivenessStats: vi.fn(async () => ({
      totalRequests: 10,
      answeredWithin24h: 10,
    })),
    getRecentBookingsReliability: vi.fn(async () => ({
      totalRecent: 20,
      cancelledCount: 0,
    })),
    getTrustFactors: vi.fn(async () => ({ isVerified: true })),
    getUserPlace: vi.fn(async () => state.place),
  },
}));

const getFoxerLeaderboard = vi.hoisted(() => vi.fn());
vi.mock("../src/modules/leaderboard/leaderboard.service", () => ({
  default: { getFoxerLeaderboard },
}));

import FoxerScoreService, {
  pickLeaderboardRole,
} from "../src/modules/foxer-score/foxer-score.service";

describe("a Foxer's place on the leaderboard", () => {
  beforeEach(() => {
    state.place = { city: "Manila", roleType: ["venueFoxer"] };
    state.entries = [
      { userId: "other", position: 1 },
      { userId: "f1", position: 2 },
    ];
    state.boardFails = false;
    getFoxerLeaderboard.mockReset();
    getFoxerLeaderboard.mockImplementation(async () => {
      if (state.boardFails) throw new Error("board down");
      return { entries: state.entries, userPosition: null, tab: "top_rated" };
    });
  });

  describe("pickLeaderboardRole", () => {
    it("takes the first board role they hold, in a fixed order", () => {
      expect(pickLeaderboardRole(["providerFoxer", "venueFoxer"])).toBe(
        "venueFoxer",
      );
      expect(pickLeaderboardRole(["providerFoxer", "eventFoxer"])).toBe(
        "eventFoxer",
      );
      expect(pickLeaderboardRole(["providerFoxer"])).toBe("providerFoxer");
    });

    it("is null for someone with no Foxer role", () => {
      expect(pickLeaderboardRole(["organizer", "investor"])).toBeNull();
      expect(pickLeaderboardRole([])).toBeNull();
    });
  });

  it("gives their position on the board for their role and city", async () => {
    const rep = await FoxerScoreService.getPublicReputation("f1");

    expect(rep.leaderboard).toEqual({
      position: 2,
      role: "venueFoxer",
      city: "Manila",
    });
    expect(getFoxerLeaderboard).toHaveBeenCalledWith(
      null,
      "top_rated",
      "venueFoxer",
      "Manila",
    );
  });

  it("asks for no city when they have none, and says so", async () => {
    state.place = { city: "  ", roleType: ["providerFoxer"] };

    const rep = await FoxerScoreService.getPublicReputation("f1");

    expect(getFoxerLeaderboard).toHaveBeenCalledWith(
      null,
      "top_rated",
      "providerFoxer",
      undefined,
    );
    expect(rep.leaderboard).toEqual({
      position: 2,
      role: "providerFoxer",
      city: null,
    });
  });

  it("is null when they are not among the ones on the board", async () => {
    state.entries = [{ userId: "other", position: 1 }];

    const rep = await FoxerScoreService.getPublicReputation("f1");

    expect(rep.leaderboard).toBeNull();
  });

  it("is null, and asks nothing, for someone with no Foxer role", async () => {
    state.place = { city: "Manila", roleType: ["organizer"] };

    const rep = await FoxerScoreService.getPublicReputation("f1");

    expect(rep.leaderboard).toBeNull();
    expect(getFoxerLeaderboard).not.toHaveBeenCalled();
  });

  it("is null for an account that is gone", async () => {
    state.place = null;

    const rep = await FoxerScoreService.getPublicReputation("f1");

    expect(rep.leaderboard).toBeNull();
  });

  it("never fails the reputation when the board cannot be read", async () => {
    state.boardFails = true;

    const rep = await FoxerScoreService.getPublicReputation("f1");

    expect(rep.leaderboard).toBeNull();
    // The rest of the reputation is still there.
    expect(rep.reviewCount).toBe(40);
    expect(rep.completedBookings).toBe(62);
  });
});
