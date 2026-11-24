import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  feedTargetMetadata,
  resolveFeedTarget,
} from "../src/modules/notifications/feed-notification-target";

/**
 * api#450: every Republic notification says where it leads (post, comment or
 * reply) and whether that content still exists, so the clients can open it.
 */

describe("feedTargetMetadata", () => {
  it("marks a post, a comment and a reply apart", () => {
    expect(feedTargetMetadata({ postId: "p" })).toEqual({
      postId: "p",
      commentId: null,
      parentCommentId: null,
      targetType: "post",
    });
    expect(feedTargetMetadata({ postId: "p", commentId: "c" })).toMatchObject({
      commentId: "c",
      parentCommentId: null,
      targetType: "comment",
    });
    expect(
      feedTargetMetadata({ postId: "p", commentId: "r", parentCommentId: "c" }),
    ).toMatchObject({
      commentId: "r",
      parentCommentId: "c",
      targetType: "reply",
    });
  });

  it("ignores a parent with no comment", () => {
    expect(
      feedTargetMetadata({ postId: "p", parentCommentId: "c" }),
    ).toMatchObject({ parentCommentId: null, targetType: "post" });
  });
});

describe("resolveFeedTarget", () => {
  const lookup = {
    postIds: new Set(["p"]),
    comments: new Map([
      ["c", { postId: "p", parentId: null }],
      ["r", { postId: "p", parentId: "c" }],
    ]),
  };

  it("is null for notifications outside the Republic", () => {
    expect(
      resolveFeedTarget("role_request_approved", { postId: "p" }, lookup),
    ).toBeNull();
  });

  it("is null for a feed notification with no metadata", () => {
    expect(resolveFeedTarget("feed:like", null, lookup)).toBeNull();
    expect(resolveFeedTarget("feed:like", ["p"], lookup)).toBeNull();
  });

  it("trusts a just-written row without a lookup", () => {
    expect(
      resolveFeedTarget("feed:reply", {
        postId: "p",
        commentId: "r",
        parentCommentId: "c",
      }),
    ).toEqual({
      type: "reply",
      postId: "p",
      commentId: "r",
      parentCommentId: "c",
      available: true,
    });
  });

  it("finds a reply's parent from the comment row for rows written before it was stored", () => {
    expect(
      resolveFeedTarget("feed:reply", { postId: "p", commentId: "r" }, lookup),
    ).toMatchObject({ type: "reply", parentCommentId: "c", available: true });
  });

  it("finds a comment like's post from the comment when the row has none", () => {
    expect(
      resolveFeedTarget("feed:comment_like", { commentId: "c" }, lookup),
    ).toMatchObject({
      type: "comment",
      postId: "p",
      commentId: "c",
      available: true,
    });
  });

  it("is null when neither the row nor a surviving comment names a post", () => {
    expect(
      resolveFeedTarget("feed:comment_like", { commentId: "gone" }, lookup),
    ).toBeNull();
  });

  it("reports a deleted comment as unavailable, keeping the post to fall back to", () => {
    expect(
      resolveFeedTarget(
        "feed:comment",
        { postId: "p", commentId: "gone" },
        lookup,
      ),
    ).toEqual({
      type: "comment",
      postId: "p",
      commentId: "gone",
      parentCommentId: null,
      available: false,
    });
  });

  it("reports a deleted post as unavailable", () => {
    expect(
      resolveFeedTarget("feed:like", { postId: "deleted" }, lookup),
    ).toMatchObject({ type: "post", postId: "deleted", available: false });
  });
});

describe("NotificationService.getForUser", () => {
  const repo = {
    findByUserId: vi.fn(),
    countUnread: vi.fn(async () => 0),
    findFeedTargets: vi.fn(),
  };

  async function loadService() {
    vi.resetModules();
    vi.doMock("../src/infrastructure/socket/socket.server", () => ({
      io: undefined,
    }));
    vi.doMock(
      "../src/modules/notifications/user-notification.repository",
      () => ({ default: repo }),
    );
    const mod =
      await import("../src/modules/notifications/user-notification.service");
    return mod.default;
  }

  const row = (id: string, type: string, metadata: unknown) => ({
    id,
    userId: "u",
    type,
    title: "t",
    message: "m",
    isRead: false,
    createdAt: new Date(),
    metadata,
  });

  beforeEach(() => vi.clearAllMocks());

  it("adds a target to each notification from one lookup and leaves metadata as it was", async () => {
    repo.findByUserId.mockResolvedValue([
      row("1", "feed:comment", { postId: "p", commentId: "c" }),
      row("2", "feed:like", { postId: "gone" }),
      row("3", "role_request_approved", { roleType: "Organizer" }),
    ]);
    repo.findFeedTargets.mockResolvedValue({
      posts: [{ id: "p" }],
      comments: [{ id: "c", postId: "p", parentId: null }],
    });
    const NotificationService = await loadService();

    const { notifications } = await NotificationService.getForUser("u", 20);

    expect(repo.findFeedTargets).toHaveBeenCalledTimes(1);
    expect(repo.findFeedTargets).toHaveBeenCalledWith(
      expect.arrayContaining(["p", "gone"]),
      ["c"],
    );
    expect(notifications[0].target).toMatchObject({
      type: "comment",
      commentId: "c",
      available: true,
    });
    expect(notifications[0].metadata).toEqual({ postId: "p", commentId: "c" });
    expect(notifications[1].target).toMatchObject({ available: false });
    expect(notifications[2].target).toBeNull();
  });

  it("checks the post of an old comment like that only stored its comment", async () => {
    repo.findByUserId.mockResolvedValue([
      row("1", "feed:comment_like", { commentId: "c" }),
    ]);
    repo.findFeedTargets
      .mockResolvedValueOnce({
        posts: [],
        comments: [{ id: "c", postId: "p", parentId: null }],
      })
      .mockResolvedValueOnce({ posts: [{ id: "p" }], comments: [] });
    const NotificationService = await loadService();

    const { notifications } = await NotificationService.getForUser("u");

    expect(repo.findFeedTargets).toHaveBeenLastCalledWith(["p"], []);
    expect(notifications[0].target).toMatchObject({
      postId: "p",
      commentId: "c",
      available: true,
    });
  });

  it("skips the lookup when no notification is from the Republic", async () => {
    repo.findByUserId.mockResolvedValue([
      row("1", "role_request_approved", null),
    ]);
    const NotificationService = await loadService();

    const { notifications } = await NotificationService.getForUser("u");

    expect(repo.findFeedTargets).not.toHaveBeenCalled();
    expect(notifications[0].target).toBeNull();
  });
});
