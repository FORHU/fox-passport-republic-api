import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `FollowRepo.getSuggestions` used to be "most-followed users you don't
 * already follow", full stop — no block check, no mutual-follow signal, and
 * a hardcoded `take: 10` with no pagination. These tests pin the three
 * behaviors added on top of that: blocked users never reach a query's
 * result set, mutual-follow candidates outrank the plain popularity
 * fallback, and `page`/`take` actually slice the ranked list.
 */

const followFindMany = vi.fn();
const followGroupBy = vi.fn();
const userFindMany = vi.fn();
const getBlockedEitherWayIds = vi.fn();

vi.mock("../src/utils/prisma", () => ({
  prisma: {
    follow: {
      findMany: (...args: unknown[]) => followFindMany(...args),
      groupBy: (...args: unknown[]) => followGroupBy(...args),
    },
    user: {
      findMany: (...args: unknown[]) => userFindMany(...args),
    },
  },
}));

vi.mock("../src/modules/block/block.repository", () => ({
  default: {
    getBlockedEitherWayIds: (...args: unknown[]) =>
      getBlockedEitherWayIds(...args),
  },
}));

import FollowRepo from "../src/modules/follow/follow.repository";

function user(id: string, followers = 0) {
  return { id, name: id, username: id, imgId: null, _count: { followers } };
}

beforeEach(() => {
  vi.clearAllMocks();
  followFindMany.mockResolvedValue([
    { followingId: "f1" },
    { followingId: "f2" },
  ]);
  getBlockedEitherWayIds.mockResolvedValue(["blocked1"]);
  followGroupBy.mockResolvedValue([
    { followingId: "mutual1", _count: { followingId: 2 } },
    { followingId: "mutual2", _count: { followingId: 1 } },
  ]);
  userFindMany.mockImplementation(
    async (args: { where: { id: { in?: string[]; notIn?: string[] } } }) => {
      if (args.where.id.in) {
        return args.where.id.in.map((id) => user(id));
      }
      // Fallback ("most-followed") lookup.
      return [user("popular1", 500)];
    },
  );
});

describe("FollowRepo.getSuggestions", () => {
  it("excludes blocked users (either direction) from every query", async () => {
    await FollowRepo.getSuggestions("me", 1, 3);

    const mutualWhere = followGroupBy.mock.calls[0][0].where;
    expect(mutualWhere.followingId.notIn).toEqual(
      expect.arrayContaining(["blocked1", "me", "f1", "f2"]),
    );

    const fallbackCall = userFindMany.mock.calls.find(
      (c) => c[0].where.id.notIn,
    );
    expect(fallbackCall[0].where.id.notIn).toEqual(
      expect.arrayContaining(["blocked1", "me", "f1", "f2"]),
    );
  });

  it("ranks mutual-follow candidates ahead of the popularity fallback", async () => {
    const result = await FollowRepo.getSuggestions("me", 1, 3);

    expect(result.map((u) => u.id)).toEqual(["mutual1", "mutual2", "popular1"]);
  });

  it("slices the ranked list by page/take instead of returning a fixed 10", async () => {
    await FollowRepo.getSuggestions("me", 2, 1);

    // Page 2 at take=1 needs a pool covering both pages (poolSize = page * take = 2).
    expect(followGroupBy.mock.calls[0][0].take).toBe(2);
  });

  it("skips the mutual-candidate query entirely when the caller follows no one", async () => {
    followFindMany.mockResolvedValue([]);

    await FollowRepo.getSuggestions("me", 1, 5);

    expect(followGroupBy).not.toHaveBeenCalled();
  });
});
