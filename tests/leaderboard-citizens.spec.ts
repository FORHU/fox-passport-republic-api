import { describe, it, expect, vi, beforeEach } from "vitest";

const repo = vi.hoisted(() => ({
  month: [] as any[],
  all: [] as any[],
  city: null as string | null,
  calls: [] as any[],
}));

vi.mock("../src/modules/leaderboard/leaderboard.repository", async () => {
  const actual = await vi.importActual<
    typeof import("../src/modules/leaderboard/leaderboard.repository")
  >("../src/modules/leaderboard/leaderboard.repository");
  return {
    ...actual,
    default: {
      cityOf: vi.fn(async () => repo.city),
      citizensByMonth: vi.fn(async (...args: unknown[]) => {
        repo.calls.push(["month", ...args]);
        return repo.month;
      }),
      citizensAllTime: vi.fn(async () => {
        repo.calls.push(["all"]);
        return repo.all;
      }),
    },
  };
});

import LeaderboardSvc from "../src/modules/leaderboard/leaderboard.service";

const row = (position: number, userId: string, level = 1) => ({
  position,
  userId,
  name: `Citizen ${userId}`,
  username: null,
  image: null,
  city: "Manila",
  level,
});

describe("LeaderboardSvc.citizens", () => {
  const now = new Date("2026-11-15T12:00:00Z");

  beforeEach(() => {
    repo.month = [];
    repo.all = [];
    repo.city = null;
    repo.calls = [];
  });

  it("defaults to this month", async () => {
    repo.month = [row(1, "a")];

    const board = await LeaderboardSvc.citizens({ viewerId: "z", now });

    expect(board.tab).toBe("month");
    expect(board.month).toBe("2026-11");
    expect(board.city).toBeNull();
    expect(repo.calls[0][0]).toBe("month");
  });

  it("refuses an unknown tab", async () => {
    for (const tab of ["week", "top", "most_booked", ""]) {
      await expect(
        LeaderboardSvc.citizens({ viewerId: "z", tab }),
      ).rejects.toMatchObject({ status: 400 });
    }
  });

  it("uses the citizen names for rank and shows level, never XP", async () => {
    repo.month = [row(1, "a", 20), row(2, "b", 3)];

    const board = await LeaderboardSvc.citizens({ viewerId: "z", now });

    expect(board.rows.map((r) => [r.rank.name, r.level])).toEqual([
      ["Adventurer", 20],
      ["Wanderer", 3],
    ]);
    expect(JSON.stringify(board)).not.toMatch(/"(xp|totalXP|gained)"/i);
  });

  it("keeps ties on the same position", async () => {
    repo.month = [row(1, "a"), row(1, "b"), row(3, "c")];

    const board = await LeaderboardSvc.citizens({ viewerId: "z", now });

    expect(board.rows.map((r) => r.position)).toEqual([1, 1, 3]);
  });

  it("all time has no month and reads the all-time ranking", async () => {
    repo.all = [row(1, "a", 30)];

    const board = await LeaderboardSvc.citizens({
      viewerId: "z",
      tab: "all",
      now,
    });

    expect(board.tab).toBe("all");
    expect(board.month).toBeNull();
    expect(repo.calls[0]).toEqual(["all"]);
    expect(board.rows[0].rank.name).toBe("Pioneer");
  });

  it("the city tab ranks within the caller's own city", async () => {
    repo.city = "Davao";
    repo.month = [row(1, "a")];

    const board = await LeaderboardSvc.citizens({
      viewerId: "z",
      tab: "city",
      now,
    });

    const [, window, city] = repo.calls[0];
    expect(city).toBe("Davao");
    expect(window.from.toISOString()).toBe("2026-10-31T16:00:00.000Z");
    expect(board.city).toBe("Davao");
    expect(board.month).toBe("2026-11");
  });

  it("the city tab is empty, not an error, for a caller with no city", async () => {
    repo.city = null;
    repo.month = [row(1, "a")];

    const board = await LeaderboardSvc.citizens({
      viewerId: "z",
      tab: "city",
      now,
    });

    expect(board.rows).toEqual([]);
    expect(board.me).toBeNull();
    expect(board.city).toBeNull();
    expect(repo.calls).toEqual([]);
  });

  it("pins the caller's own place when they are below the rows", async () => {
    repo.month = Array.from({ length: 30 }, (_, i) => row(i + 1, `u${i + 1}`));

    const board = await LeaderboardSvc.citizens({
      viewerId: "u27",
      limit: 5,
      now,
    });

    expect(board.rows).toHaveLength(5);
    expect(board.rows.some((r) => r.isMe)).toBe(false);
    expect(board.me).toMatchObject({ userId: "u27", position: 27, isMe: true });
  });

  it("caps the page size", async () => {
    repo.month = Array.from({ length: 80 }, (_, i) => row(i + 1, `u${i + 1}`));

    const big = await LeaderboardSvc.citizens({
      viewerId: "z",
      limit: 500,
      now,
    });
    const tiny = await LeaderboardSvc.citizens({
      viewerId: "z",
      limit: -3,
      now,
    });

    expect(big.rows).toHaveLength(50);
    expect(tiny.rows).toHaveLength(1);
  });
});
