import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/utils/prisma";
import FeedService from "../src/modules/feed/feed.service";
import { AuthenticatedUser } from "../src/types/auth";

// app#303: shares, sends and reposts are separate counters, and a view is
// counted once per logged-in non-author viewer.
describe("Republic post counters and views", () => {
  const runId = Math.random().toString(36).substring(7);
  const ids: Record<string, string> = {};
  let publicPost: string;
  let followersPost: string;
  let onlyMePost: string;
  let archivedPost: string;

  const as = (key: string): AuthenticatedUser => ({
    userId: ids[key],
    email: `${key}_${runId}@test.com`,
    systemRole: "user",
    roleType: [],
  });

  const counts = (id: string) =>
    prisma.post.findUniqueOrThrow({
      where: { id },
      select: {
        sharesCount: true,
        sendsCount: true,
        repostsCount: true,
        viewsCount: true,
      },
    });

  beforeAll(async () => {
    for (const key of ["author", "viewer", "follower"]) {
      const u = await prisma.user.create({
        data: {
          email: `${key}_${runId}@test.com`,
          username: `${key}_${runId}`,
          password: "pw",
          roleType: [],
          name: key,
        },
      });
      ids[key] = u.id;
    }
    await prisma.follow.create({
      data: { followerId: ids.follower, followingId: ids.author },
    });
    const make = (data: Record<string, unknown> = {}) =>
      prisma.post
        .create({
          data: {
            authorId: ids.author,
            type: "citizen_experience",
            tab: "community",
            content: "Counters",
            ...data,
          },
        })
        .then((p) => p.id);
    publicPost = await make();
    followersPost = await make({ visibility: "followers" });
    onlyMePost = await make({ visibility: "only_me" });
    archivedPost = await make({ isArchived: true });
  });

  afterAll(async () => {
    await prisma.post.deleteMany({
      where: { authorId: { in: Object.values(ids) } },
    });
    await prisma.user.deleteMany({ where: { id: { in: Object.values(ids) } } });
  });

  it("counts a view once per viewer", async () => {
    expect(await FeedService.recordViews(ids.viewer, [publicPost])).toEqual([
      publicPost,
    ]);
    expect(await FeedService.recordViews(ids.viewer, [publicPost])).toEqual([]);
    expect((await counts(publicPost)).viewsCount).toBe(1);
  });

  it("dedupes ids within one batch", async () => {
    const recorded = await FeedService.recordViews(ids.follower, [
      publicPost,
      publicPost,
    ]);
    expect(recorded).toEqual([publicPost]);
    expect((await counts(publicPost)).viewsCount).toBe(2);
  });

  it("never counts the author's own views", async () => {
    expect(await FeedService.recordViews(ids.author, [publicPost])).toEqual([]);
    expect((await counts(publicPost)).viewsCount).toBe(2);
  });

  it("only counts posts the viewer is allowed to see", async () => {
    const batch = [followersPost, onlyMePost, archivedPost];
    expect(await FeedService.recordViews(ids.viewer, batch)).toEqual([]);
    expect(await FeedService.recordViews(ids.follower, batch)).toEqual([
      followersPost,
    ]);
    expect((await counts(onlyMePost)).viewsCount).toBe(0);
    expect((await counts(archivedPost)).viewsCount).toBe(0);
  });

  it("counts a repost as a repost, not a share", async () => {
    await FeedService.repost(publicPost, as("viewer"), "");
    const c = await counts(publicPost);
    expect(c.repostsCount).toBe(1);
    expect(c.sharesCount).toBe(0);
  });

  it("counts an external share as a share", async () => {
    expect(await FeedService.trackShare(publicPost, ids.viewer)).toMatchObject({
      counted: true,
      sharesCount: 1,
    });
    const c = await counts(publicPost);
    expect(c.sharesCount).toBe(1);
    expect(c.repostsCount).toBe(1);
  });

  it("returns the new counters on feed reads", async () => {
    const post = await FeedService.getPostById(publicPost, ids.viewer);
    expect(post).toMatchObject({
      sharesCount: 1,
      repostsCount: 1,
      sendsCount: 0,
      viewsCount: 2,
      isSharedByMe: true,
    });
    const other = await FeedService.getPostById(publicPost, ids.follower);
    expect(other).toMatchObject({ isSharedByMe: false });
  });

  describe("one share per user per post", () => {
    let post: string;

    beforeAll(async () => {
      post = (
        await prisma.post.create({
          data: {
            authorId: ids.author,
            type: "citizen_experience",
            tab: "community",
            content: "Share me",
          },
        })
      ).id;
    });

    it("counts a user's repeat shares once", async () => {
      const first = await FeedService.trackShare(post, ids.viewer);
      const again = await FeedService.trackShare(post, ids.viewer);
      expect(first).toMatchObject({ counted: true, sharesCount: 1 });
      expect(again).toMatchObject({ counted: false, sharesCount: 1 });
      expect((await counts(post)).sharesCount).toBe(1);
    });

    it("counts concurrent duplicate requests once", async () => {
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          FeedService.trackShare(post, ids.follower),
        ),
      );
      expect(results.filter((r) => r.counted)).toHaveLength(1);
      expect((await counts(post)).sharesCount).toBe(2);
      expect(
        await prisma.postShare.count({
          where: { postId: post, userId: ids.follower },
        }),
      ).toBe(1);
    });

    it("counts each different user", async () => {
      expect(await FeedService.trackShare(post, ids.author)).toMatchObject({
        counted: true,
        sharesCount: 3,
      });
    });

    it("doesn't count a guest", async () => {
      expect(await FeedService.trackShare(post)).toMatchObject({
        counted: false,
        sharesCount: 3,
      });
      expect((await counts(post)).sharesCount).toBe(3);
    });

    it("refuses a post the viewer can't see", async () => {
      await expect(
        FeedService.trackShare(onlyMePost, ids.viewer),
      ).rejects.toThrow();
      expect((await counts(onlyMePost)).sharesCount).toBe(0);
    });

    it("counts the same user once across copy link and Facebook", async () => {
      // FacebookService.share records through the same FeedRepo.recordShare.
      const FeedRepo = (await import("../src/modules/feed/feed.repository"))
        .default;
      expect(await FeedRepo.recordShare(post, ids.author)).toMatchObject({
        counted: false,
        sharesCount: 3,
      });
    });
  });
});
