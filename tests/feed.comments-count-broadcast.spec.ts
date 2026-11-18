import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A post's new comment count goes out over the socket to every connected
 * client, so only public posts may be announced. The repository and socket
 * are stubbed.
 */

const repo = vi.hoisted(() => ({
  findCommentById: vi.fn(),
  findPostById: vi.fn(),
  deleteComment: vi.fn(),
  findCommentsCount: vi.fn(),
}));
vi.mock("../src/modules/feed/feed.repository", () => ({ default: repo }));

const announcePostCommentsCount = vi.hoisted(() => vi.fn());
vi.mock("../src/infrastructure/socket/invalidate", () => ({
  announcePostCommentsCount,
}));

const { default: FeedService } =
  await import("../src/modules/feed/feed.service");

const author = { userId: "u1" } as Parameters<
  typeof FeedService.deleteComment
>[1];

/** Lets the fire-and-forget broadcast settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  vi.clearAllMocks();
  repo.findCommentById.mockResolvedValue({
    id: "c1",
    postId: "p1",
    authorId: "u1",
  });
  repo.findPostById.mockResolvedValue({ id: "p1", authorId: "u2" });
  repo.deleteComment.mockResolvedValue({ id: "c1", postId: "p1" });
});

describe("comment count broadcast on comment delete", () => {
  it("announces a public post's stored count", async () => {
    repo.findCommentsCount.mockResolvedValue({
      commentsCount: 2,
      visibility: "public",
    });
    await FeedService.deleteComment("c1", author);
    await settle();
    expect(announcePostCommentsCount).toHaveBeenCalledWith("p1", 2);
  });

  it.each(["followers", "only_me"])(
    "keeps a %s post's count off the socket",
    async (visibility) => {
      repo.findCommentsCount.mockResolvedValue({
        commentsCount: 2,
        visibility,
      });
      await FeedService.deleteComment("c1", author);
      await settle();
      expect(announcePostCommentsCount).not.toHaveBeenCalled();
    },
  );

  it("stays quiet when the post is gone, and when the lookup fails", async () => {
    repo.findCommentsCount.mockResolvedValueOnce(null);
    await FeedService.deleteComment("c1", author);
    repo.findCommentsCount.mockRejectedValueOnce(new Error("db down"));
    await expect(FeedService.deleteComment("c1", author)).resolves.toEqual({
      id: "c1",
      postId: "p1",
    });
    await settle();
    expect(announcePostCommentsCount).not.toHaveBeenCalled();
  });
});
