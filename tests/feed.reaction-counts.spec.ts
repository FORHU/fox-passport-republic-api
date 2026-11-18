import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * api#311 / mobile#381: posts carry how many of each reaction they have, so
 * the apps can show the reaction emojis beside the total (Facebook-style)
 * instead of one heart for every reaction. Prisma is stubbed.
 */

const prisma = vi.hoisted(() => ({
  savedPost: { findMany: vi.fn() },
  postLike: { groupBy: vi.fn() },
}));
vi.mock("../src/utils/prisma", () => ({ prisma }));

const { default: FeedRepo } =
  await import("../src/modules/feed/feed.repository");

const row = (postId: string, type: string, count: number) => ({
  postId,
  type,
  _count: { type: count },
});

beforeEach(() => {
  vi.clearAllMocks();
  prisma.postLike.groupBy.mockResolvedValue([]);
});

describe("FeedRepo.findReactionCounts", () => {
  it("skips the query when there are no posts", async () => {
    const counts = await FeedRepo.findReactionCounts([]);
    expect(counts.size).toBe(0);
    expect(prisma.postLike.groupBy).not.toHaveBeenCalled();
  });

  it("groups the whole page in one query", async () => {
    await FeedRepo.findReactionCounts(["a", "b"]);
    expect(prisma.postLike.groupBy).toHaveBeenCalledTimes(1);
    expect(prisma.postLike.groupBy).toHaveBeenCalledWith({
      by: ["postId", "type"],
      where: { postId: { in: ["a", "b"] } },
      _count: { type: true },
    });
  });

  it("lists each post's reactions, most chosen first", async () => {
    prisma.postLike.groupBy.mockResolvedValue([
      row("a", "love", 1),
      row("a", "like", 3),
      row("b", "haha", 2),
      row("a", "wow", 2),
    ]);
    const counts = await FeedRepo.findReactionCounts(["a", "b", "c"]);
    expect(counts.get("a")).toEqual([
      { type: "like", count: 3 },
      { type: "wow", count: 2 },
      { type: "love", count: 1 },
    ]);
    expect(counts.get("b")).toEqual([{ type: "haha", count: 2 }]);
    expect(counts.has("c")).toBe(false);
  });
});

describe("FeedRepo.findSavedPosts reactionCounts", () => {
  it("adds each post's counts, and [] for a post with none", async () => {
    prisma.savedPost.findMany.mockResolvedValue([
      {
        postId: "a",
        userId: "viewer",
        post: { id: "a", likesCount: 2, likes: [] },
      },
      {
        postId: "b",
        userId: "viewer",
        post: { id: "b", likesCount: 0, likes: [] },
      },
    ]);
    prisma.postLike.groupBy.mockResolvedValue([
      row("a", "like", 1),
      row("a", "love", 1),
    ]);

    const { posts } = await FeedRepo.findSavedPosts("viewer");

    expect(posts[0].reactionCounts).toEqual([
      { type: "like", count: 1 },
      { type: "love", count: 1 },
    ]);
    expect(posts[1].reactionCounts).toEqual([]);
  });
});
