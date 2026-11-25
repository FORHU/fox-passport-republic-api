import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Comments take the same six reactions as posts (api#427). The repository
 * and notifications are stubbed; the old heart toggle (still used by mobile)
 * must keep its shape.
 */

const repo = vi.hoisted(() => ({
  findCommentById: vi.fn(),
  findPostById: vi.fn(),
  findCommentReaction: vi.fn(),
  setCommentReaction: vi.fn(),
}));
vi.mock("../src/modules/feed/feed.repository", () => ({ default: repo }));

const notify = vi.hoisted(() => vi.fn());
vi.mock("../src/modules/notifications/user-notification.service", () => ({
  default: { create: notify },
}));

const socket = vi.hoisted(() => ({
  announceCommentReactionsCount: vi.fn(),
  announcePostReactionsCount: vi.fn(),
  announcePostCommentsCount: vi.fn(),
  announceNewPost: vi.fn(),
}));
vi.mock("../src/infrastructure/socket/invalidate", () => socket);

vi.mock("../src/utils/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn().mockResolvedValue({ name: "Ana", username: "ana" }),
    },
  },
}));

const { default: FeedService } =
  await import("../src/modules/feed/feed.service");

type User = Parameters<typeof FeedService.setCommentReaction>[2];
const viewer = { userId: "viewer", email: "viewer@example.com" } as User;

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  vi.clearAllMocks();
  notify.mockResolvedValue(undefined);
  repo.findCommentById.mockResolvedValue({
    id: "c1",
    postId: "p1",
    authorId: "author",
    parentId: null,
  });
  repo.findPostById.mockResolvedValue({
    id: "p1",
    authorId: "poster",
    visibility: "public",
  });
  repo.findCommentReaction.mockResolvedValue(null);
  // `previous` comes back from the repository's transaction; the tests set
  // it through findCommentReaction, which the heart toggle also reads.
  repo.setCommentReaction.mockImplementation(
    async (_c: string, _u: string, type: string | null) => ({
      reaction: type,
      previous: await repo.findCommentReaction(),
      likesCount: type ? 1 : 0,
    }),
  );
});

describe("FeedService.setCommentReaction", () => {
  it("sets any of the six reactions and reports it", async () => {
    const result = await FeedService.setCommentReaction(
      "p1",
      "c1",
      viewer,
      "haha",
    );
    expect(repo.setCommentReaction).toHaveBeenCalledWith("c1", "viewer", "haha");
    expect(result).toEqual({ reaction: "haha", likesCount: 1, liked: true });
  });

  it("removes the reaction with null", async () => {
    repo.findCommentReaction.mockResolvedValue("love");
    const result = await FeedService.setCommentReaction(
      "p1",
      "c1",
      viewer,
      null,
    );
    expect(result).toEqual({ reaction: null, likesCount: 0, liked: false });
  });

  it("is a not-found for a comment on another post", async () => {
    await expect(
      FeedService.setCommentReaction("other-post", "c1", viewer, "like"),
    ).rejects.toThrow(/Comment/);
    expect(repo.setCommentReaction).not.toHaveBeenCalled();
  });

  it("is a not-found when the viewer can't see the post", async () => {
    repo.findPostById.mockResolvedValue(null);
    await expect(
      FeedService.setCommentReaction("p1", "c1", viewer, "like"),
    ).rejects.toThrow(/Post/);
    expect(repo.setCommentReaction).not.toHaveBeenCalled();
  });

  it("notifies the comment's author by name, never by email", async () => {
    await FeedService.setCommentReaction("p1", "c1", viewer, "wow");
    await settle();
    expect(notify).toHaveBeenCalledTimes(1);
    const [n] = notify.mock.calls[0];
    expect(n).toMatchObject({
      userId: "author",
      type: "feed:comment_like",
      message: "Ana reacted to your comment.",
      metadata: { reaction: "wow", likerId: "viewer", commentId: "c1" },
    });
    expect(JSON.stringify(n)).not.toContain("viewer@example.com");
  });

  it("doesn't notify again when swapping one emoji for another", async () => {
    repo.findCommentReaction.mockResolvedValue("like");
    await FeedService.setCommentReaction("p1", "c1", viewer, "sad");
    await settle();
    expect(notify).not.toHaveBeenCalled();
  });

  it("doesn't notify someone reacting to their own comment", async () => {
    repo.findCommentById.mockResolvedValue({
      id: "c1",
      postId: "p1",
      authorId: "viewer",
      parentId: null,
    });
    await FeedService.setCommentReaction("p1", "c1", viewer, "like");
    await settle();
    expect(notify).not.toHaveBeenCalled();
  });
});

describe("FeedService.toggleCommentLike (heart toggle kept for mobile)", () => {
  it("adds a like when the viewer has no reaction", async () => {
    const result = await FeedService.toggleCommentLike("c1", viewer);
    expect(repo.setCommentReaction).toHaveBeenCalledWith("c1", "viewer", "like");
    expect(result).toEqual({ liked: true, likesCount: 1 });
  });

  it("removes any reaction, not only a like", async () => {
    repo.findCommentReaction.mockResolvedValue("angry");
    const result = await FeedService.toggleCommentLike("c1", viewer);
    expect(repo.setCommentReaction).toHaveBeenCalledWith("c1", "viewer", null);
    expect(result).toEqual({ liked: false, likesCount: 0 });
  });
});

describe("live comment reaction counts (api#427)", () => {
  it("tells everyone the new count on a public post, not who reacted", async () => {
    await FeedService.setCommentReaction("p1", "c1", viewer, "wow");
    expect(socket.announceCommentReactionsCount).toHaveBeenCalledWith(
      "p1",
      "c1",
      1,
    );
  });

  it.each(["followers", "only_me"])(
    "keeps a %s post's comment reactions off the socket",
    async (visibility) => {
      repo.findPostById.mockResolvedValue({
        id: "p1",
        authorId: "poster",
        visibility,
      });
      await FeedService.setCommentReaction("p1", "c1", viewer, "wow");
      expect(socket.announceCommentReactionsCount).not.toHaveBeenCalled();
    },
  );
});
