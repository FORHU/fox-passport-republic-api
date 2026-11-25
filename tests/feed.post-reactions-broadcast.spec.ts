import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * api#427: a post's new reaction count goes to every connected client so
 * open feeds and profiles update live. The event reaches every socket, so
 * only public posts may be announced, and it never says who reacted. The
 * repository and socket are stubbed.
 */

const repo = vi.hoisted(() => ({
  findPostById: vi.fn(),
  setReaction: vi.fn(),
}));
vi.mock("../src/modules/feed/feed.repository", () => ({ default: repo }));

const socket = vi.hoisted(() => ({
  announcePostReactionsCount: vi.fn(),
  announceCommentReactionsCount: vi.fn(),
  announcePostCommentsCount: vi.fn(),
  announceNewPost: vi.fn(),
}));
vi.mock("../src/infrastructure/socket/invalidate", () => socket);
vi.mock("../src/modules/notifications/user-notification.service", () => ({
  default: { create: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("../src/utils/prisma", () => ({
  prisma: { user: { findUnique: vi.fn().mockResolvedValue({ name: "Ana" }) } },
}));

const { default: FeedService } =
  await import("../src/modules/feed/feed.service");

const viewer = { userId: "viewer" } as Parameters<
  typeof FeedService.setReaction
>[1];

beforeEach(() => {
  vi.clearAllMocks();
  repo.setReaction.mockResolvedValue({ reaction: "love", likesCount: 8 });
});

describe("post:reactions_count broadcast", () => {
  it("announces a public post's new total", async () => {
    repo.findPostById.mockResolvedValue({
      id: "p1",
      authorId: "poster",
      visibility: "public",
      isLikedByMe: false,
    });
    await FeedService.setReaction("p1", viewer, "love");
    expect(socket.announcePostReactionsCount).toHaveBeenCalledWith("p1", 8);
  });

  it("announces a removed reaction too", async () => {
    repo.findPostById.mockResolvedValue({
      id: "p1",
      authorId: "poster",
      visibility: "public",
      isLikedByMe: true,
    });
    repo.setReaction.mockResolvedValue({ reaction: null, likesCount: 7 });
    await FeedService.setReaction("p1", viewer, null);
    expect(socket.announcePostReactionsCount).toHaveBeenCalledWith("p1", 7);
  });

  it.each(["followers", "only_me"])(
    "keeps a %s post's reactions off the socket",
    async (visibility) => {
      repo.findPostById.mockResolvedValue({
        id: "p1",
        authorId: "poster",
        visibility,
        isLikedByMe: false,
      });
      await FeedService.setReaction("p1", viewer, "love");
      expect(socket.announcePostReactionsCount).not.toHaveBeenCalled();
    },
  );
});
