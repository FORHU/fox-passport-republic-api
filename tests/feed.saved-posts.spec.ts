import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * BUG-25 (app#139): saved posts came back without the viewer's reaction, so
 * the Saved page showed a liked post as not liked, and liking it again bumped
 * the count until the server corrected it. They now carry isLikedByMe and
 * myReaction like the feed list. Prisma is stubbed.
 */

const prisma = vi.hoisted(() => ({
  savedPost: { findMany: vi.fn() },
}));
vi.mock("../src/utils/prisma", () => ({ prisma }));

const { default: FeedRepo } =
  await import("../src/modules/feed/feed.repository");

const savedRow = (
  postId: string,
  likes: { userId: string; type: string }[],
) => ({
  postId,
  userId: "viewer",
  post: { id: postId, likesCount: 3, commentsCount: 1, likes },
});

beforeEach(() => vi.clearAllMocks());

describe("FeedRepo.findSavedPosts", () => {
  it("asks only for the viewer's own reaction", async () => {
    prisma.savedPost.findMany.mockResolvedValue([]);
    await FeedRepo.findSavedPosts("viewer");
    const args = prisma.savedPost.findMany.mock.calls[0][0];
    expect(args.include.post.include.likes).toEqual({
      where: { userId: "viewer" },
      select: { userId: true, type: true },
    });
  });

  it("returns isLikedByMe and myReaction, without the raw likes", async () => {
    prisma.savedPost.findMany.mockResolvedValue([
      savedRow("liked", [{ userId: "viewer", type: "love" }]),
      savedRow("not-liked", []),
    ]);

    const { posts, nextCursor } = await FeedRepo.findSavedPosts("viewer");

    expect(posts).toEqual([
      {
        id: "liked",
        likesCount: 3,
        commentsCount: 1,
        isLikedByMe: true,
        myReaction: "love",
      },
      {
        id: "not-liked",
        likesCount: 3,
        commentsCount: 1,
        isLikedByMe: false,
        myReaction: null,
      },
    ]);
    expect(nextCursor).toBeNull();
  });
});
