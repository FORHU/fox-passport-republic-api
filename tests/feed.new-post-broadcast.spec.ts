import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * app#308: a new post tells every open feed over the socket, so open feeds can
 * show a "New posts" pill. The event goes to everyone connected, so only
 * public posts may be announced. The repository and socket are stubbed.
 */

const repo = vi.hoisted(() => ({
  createPost: vi.fn(),
  findPostById: vi.fn(),
  incrementReposts: vi.fn(),
  countUserPosts: vi.fn(),
}));
vi.mock("../src/modules/feed/feed.repository", () => ({ default: repo }));

const announceNewPost = vi.hoisted(() => vi.fn());
vi.mock("../src/infrastructure/socket/invalidate", () => ({
  announceNewPost,
  announcePostCommentsCount: vi.fn(),
}));
vi.mock("../src/modules/reward/reward.service", () => ({
  default: { grant: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("../src/modules/notifications/user-notification.service", () => ({
  default: { create: vi.fn().mockResolvedValue(undefined) },
}));

const { default: FeedService } =
  await import("../src/modules/feed/feed.service");

const user = {
  userId: "u1",
  email: "u1@test.com",
  systemRole: "user",
  roleType: [],
} as unknown as Parameters<typeof FeedService.createPost>[0];

beforeEach(() => {
  vi.clearAllMocks();
  repo.countUserPosts.mockResolvedValue(0);
  repo.incrementReposts.mockResolvedValue(undefined);
});

describe("feed:new broadcast", () => {
  it("announces a public post with its tab only", async () => {
    repo.createPost.mockResolvedValue({
      id: "p1",
      tab: "community",
      visibility: "public",
    });
    await FeedService.createPost(user, {
      type: "citizen_experience",
      content: "Sunset run tonight",
    });
    expect(announceNewPost).toHaveBeenCalledWith("community");
  });

  it.each(["followers", "only_me"])(
    "keeps a %s post off the socket",
    async (visibility) => {
      repo.createPost.mockResolvedValue({
        id: "p1",
        tab: "community",
        visibility,
      });
      await FeedService.createPost(user, {
        type: "citizen_experience",
        content: "Just for friends",
        visibility: visibility as "followers",
      });
      expect(announceNewPost).not.toHaveBeenCalled();
    },
  );

  it("announces a repost, which is always public", async () => {
    repo.findPostById.mockResolvedValue({
      id: "orig",
      authorId: "u2",
      type: "citizen_experience",
      tab: "marketplace",
      originalPostId: null,
    });
    repo.createPost.mockResolvedValue({
      id: "p2",
      tab: "marketplace",
      visibility: "public",
    });
    await FeedService.repost("orig", user, "");
    expect(announceNewPost).toHaveBeenCalledWith("marketplace");
  });
});
