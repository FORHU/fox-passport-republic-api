import { describe, it, expect, vi, beforeEach } from "vitest";

const repo = vi.hoisted(() => ({ rows: [] as any[], calls: [] as any[] }));

vi.mock("../src/modules/leaderboard/leaderboard.repository", async () => {
  const actual = await vi.importActual<
    typeof import("../src/modules/leaderboard/leaderboard.repository")
  >("../src/modules/leaderboard/leaderboard.repository");
  return {
    ...actual,
    default: {
      mostBooked: vi.fn(async (...args: unknown[]) => {
        repo.calls.push(args);
        return repo.rows;
      }),
    },
  };
});

import LeaderboardSvc, {
  manilaMonthWindow,
} from "../src/modules/leaderboard/leaderboard.service";

const row = (
  position: number,
  userId: string,
  level = 1,
  path = "venueFoxer",
) => ({
  position,
  userId,
  name: `Foxer ${userId}`,
  username: null,
  image: null,
  city: "Manila",
  level,
  path,
});

describe("manilaMonthWindow", () => {
  it("starts the month at midnight in Manila, which is 16:00 UTC the day before", () => {
    const w = manilaMonthWindow(new Date("2026-11-15T12:00:00Z"));
    expect(w.month).toBe("2026-11");
    expect(w.from.toISOString()).toBe("2026-10-31T16:00:00.000Z");
    expect(w.to.toISOString()).toBe("2026-11-30T16:00:00.000Z");
  });

  it("is still the old month for the last hours of it, in UTC terms", () => {
    // 31 Oct 17:00 UTC is already 1 Nov 01:00 in Manila.
    expect(manilaMonthWindow(new Date("2026-10-31T17:00:00Z")).month).toBe(
      "2026-11",
    );
    // 31 Oct 15:59 UTC is still 31 Oct 23:59 in Manila.
    expect(manilaMonthWindow(new Date("2026-10-31T15:59:00Z")).month).toBe(
      "2026-10",
    );
  });

  it("rolls the year over in December", () => {
    const w = manilaMonthWindow(new Date("2026-12-20T00:00:00Z"));
    expect(w.month).toBe("2026-12");
    expect(w.to.toISOString()).toBe("2026-12-31T16:00:00.000Z");
    expect(manilaMonthWindow(new Date("2026-12-31T16:00:00Z")).month).toBe(
      "2027-01",
    );
  });
});

describe("LeaderboardSvc.foxers", () => {
  const now = new Date("2026-11-15T12:00:00Z");

  beforeEach(() => {
    repo.rows = [];
    repo.calls = [];
  });

  it("refuses an unknown role", async () => {
    await expect(
      LeaderboardSvc.foxers({ viewerId: "me", role: "wizard" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("refuses the tabs that are not built yet", async () => {
    for (const tab of ["top_rated", "rising", "nope"]) {
      await expect(
        LeaderboardSvc.foxers({ viewerId: "me", role: "venue", tab }),
      ).rejects.toMatchObject({ status: 400 });
    }
  });

  it("refuses a city that is far too long", async () => {
    await expect(
      LeaderboardSvc.foxers({
        viewerId: "me",
        role: "venue",
        city: "x".repeat(81),
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("ranks with the Foxer names for the role's own path and shows no counts", async () => {
    repo.rows = [row(1, "a", 20, "venueFoxer"), row(2, "b", 3, "venueFoxer")];

    const board = await LeaderboardSvc.foxers({
      viewerId: "z",
      role: "venue",
      now,
    });

    expect(board.month).toBe("2026-11");
    expect(board.rows.map((r) => [r.position, r.rank.name])).toEqual([
      [1, "Maestro"],
      [2, "Regular"],
    ]);
    expect(JSON.stringify(board)).not.toMatch(/"(n|count|bookings)"/);
    expect(board.me).toBeNull();
  });

  it("keeps ties on the same position", async () => {
    repo.rows = [row(1, "a"), row(1, "b"), row(3, "c")];

    const board = await LeaderboardSvc.foxers({
      viewerId: "z",
      role: "venue",
      now,
    });

    expect(board.rows.map((r) => r.position)).toEqual([1, 1, 3]);
  });

  it("pins the caller's own place even when they are below the rows", async () => {
    repo.rows = Array.from({ length: 30 }, (_, i) => row(i + 1, `u${i + 1}`));

    const board = await LeaderboardSvc.foxers({
      viewerId: "u27",
      role: "venue",
      limit: 5,
      now,
    });

    expect(board.rows).toHaveLength(5);
    expect(board.rows.some((r) => r.isMe)).toBe(false);
    expect(board.me).toMatchObject({ userId: "u27", position: 27, isMe: true });
  });

  it("marks the caller inside the rows too", async () => {
    repo.rows = [row(1, "me"), row(2, "b")];

    const board = await LeaderboardSvc.foxers({
      viewerId: "me",
      role: "venue",
      now,
    });

    expect(board.rows[0].isMe).toBe(true);
    expect(board.me?.position).toBe(1);
  });

  it("caps the page size and treats a silly one as the smallest", async () => {
    repo.rows = Array.from({ length: 80 }, (_, i) => row(i + 1, `u${i + 1}`));

    const big = await LeaderboardSvc.foxers({
      viewerId: "z",
      role: "venue",
      limit: 500,
      now,
    });
    const tiny = await LeaderboardSvc.foxers({
      viewerId: "z",
      role: "venue",
      limit: -3,
      now,
    });

    expect(big.rows).toHaveLength(50);
    expect(tiny.rows).toHaveLength(1);
  });

  it("passes the role, the Manila month and the trimmed city to the query", async () => {
    await LeaderboardSvc.foxers({
      viewerId: "z",
      role: "gear",
      city: "  Davao ",
      now,
    });

    const [role, window, city] = repo.calls[0];
    expect(role).toBe("gear");
    expect(window.from.toISOString()).toBe("2026-10-31T16:00:00.000Z");
    expect(city).toBe("Davao");
  });
});
