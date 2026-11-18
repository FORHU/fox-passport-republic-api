import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "./setup"; // refuses to run unless DATABASE_URL is a *_test database
import { prisma } from "../src/utils/prisma";
import FeedService from "../src/modules/feed/feed.service";
import { AppError } from "../src/utils/errors";
import { FRESH_POOL_SIZE } from "../src/utils/feed-ranking";

/**
 * app#308 against a real database: a For you session pages through its whole
 * list without repeats or gaps (while its own resurfacing writes land between
 * pages), a new session reorders it, older posts come back labelled, and
 * nobody sees a post they couldn't see before.
 *
 * Every query is scoped by a run-unique search token, so posts that other
 * spec files create in parallel never leak into these assertions.
 */

const HOUR = 60 * 60 * 1000;
const OLDER_COUNT = 30;
const TOTAL = FRESH_POOL_SIZE + OLDER_COUNT;

/**
 * The posts among [postIds] with a resurfacing row written at or after
 * [since], waiting for the fire-and-forget write to land. Earlier sessions
 * leave rows of their own, so only rows from this request count.
 */
async function resurfacedSince(postIds: string[], since: Date) {
  let found = new Set<string>();
  for (let i = 0; i < 40; i++) {
    const rows = await prisma.postResurfacing.findMany({
      where: { postId: { in: postIds }, shownAt: { gte: since } },
      select: { postId: true },
    });
    found = new Set(rows.map((r) => r.postId));
    if (found.size === postIds.length) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  return found;
}

describe("For you feed", () => {
  const runId = `fy${Math.random().toString(36).substring(2, 9)}`;
  const ids: Record<string, string> = {};
  let pinnedId: string;
  let followersOnlyId: string;
  let hiddenId: string;

  const page = (viewer: string | undefined, cursor?: string, limit = 50) =>
    FeedService.getFeed({
      mode: "foryou",
      search: runId,
      viewerId: viewer ? ids[viewer] : undefined,
      cursor,
      limit,
    });

  /** Every post id of one session, page by page. */
  async function walk(viewer?: string) {
    const seen: string[] = [];
    const resurfaced: string[] = [];
    let cursor: string | undefined;
    let first = true;
    while (first || cursor) {
      first = false;
      const res = await page(viewer, cursor);
      for (const p of res.posts) {
        seen.push(p.id);
        if (p.resurfaced) resurfaced.push(p.id);
      }
      cursor = res.nextCursor ?? undefined;
    }
    return { seen, resurfaced };
  }

  beforeAll(async () => {
    for (const key of ["a", "b", "c", "d", "viewer", "fan"]) {
      const u = await prisma.user.create({
        data: {
          email: `${key}_${runId}@test.com`,
          username: `${key}_${runId}`,
          password: "pw",
          roleType: [],
          name: `${key} ${runId}`,
        },
      });
      ids[key] = u.id;
    }
    const authors = ["a", "b", "c", "d"];
    const now = Date.now();
    await prisma.post.createMany({
      data: Array.from({ length: TOTAL }, (_, i) => ({
        authorId: ids[authors[i % authors.length]],
        type: "citizen_experience" as const,
        tab: "community" as const,
        content: `${runId} post ${i}`,
        likesCount: i % 9,
        // One post an hour, newest first: the last 30 fall outside the fresh pool.
        createdAt: new Date(now - (i + 1) * HOUR),
      })),
    });

    const pinned = await prisma.post.create({
      data: {
        authorId: ids.a,
        type: "citizen_experience",
        tab: "community",
        content: `${runId} featured`,
        isPinned: true,
        createdAt: new Date(now - 500 * HOUR),
      },
    });
    pinnedId = pinned.id;

    const followersOnly = await prisma.post.create({
      data: {
        authorId: ids.d,
        type: "citizen_experience",
        tab: "community",
        content: `${runId} for followers`,
        visibility: "followers",
        createdAt: new Date(now - 30 * 60 * 1000),
      },
    });
    followersOnlyId = followersOnly.id;
    await prisma.follow.create({
      data: { followerId: ids.fan, followingId: ids.d },
    });

    const hidden = await prisma.post.create({
      data: {
        authorId: ids.b,
        type: "citizen_experience",
        tab: "community",
        content: `${runId} hidden by viewer`,
        createdAt: new Date(now - 20 * 60 * 1000),
      },
    });
    hiddenId = hidden.id;
    await prisma.hiddenPost.create({
      data: { userId: ids.viewer, postId: hiddenId },
    });
  });

  afterAll(async () => {
    // Deleting the users cascades to their posts and resurfacing rows.
    await prisma.user.deleteMany({ where: { id: { in: Object.values(ids) } } });
  });

  it("pages through one session with no repeats or gaps", async () => {
    const { seen } = await walk("viewer");
    // TOTAL + pinned; the followers-only post is invisible and the hidden one hidden.
    expect(seen).toHaveLength(TOTAL + 1);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).not.toContain(followersOnlyId);
    expect(seen).not.toContain(hiddenId);
  });

  it("puts one featured post first, on the first page only", async () => {
    const first = await page("viewer");
    expect(first.posts[0]).toMatchObject({ id: pinnedId, isFeatured: true });
    // The session's anchor comes back for the "New posts" check, and stays put.
    expect("anchor" in first && typeof first.anchor).toBe("string");
    const second0 = await page("viewer", first.nextCursor ?? undefined);
    expect("anchor" in second0 && second0.anchor).toBe(
      "anchor" in first && first.anchor,
    );
    expect(first.posts.filter((p) => p.isFeatured)).toHaveLength(1);
    const second = await page("viewer", first.nextCursor ?? undefined);
    expect(second.posts.some((p) => p.isFeatured)).toBe(false);
  });

  it("brings older posts back in every 4th slot, labelled, and records them", async () => {
    const before = new Date();
    const first = await page(undefined);
    first.posts.forEach((p, i) => {
      expect(p.resurfaced).toBe((i + 1) % 4 === 0);
    });
    const shown = first.posts.filter((p) => p.resurfaced).map((p) => p.id);
    expect(shown.length).toBeGreaterThan(0);
    expect(await resurfacedSince(shown, before)).toEqual(new Set(shown));
  });

  it("shows a different mix after a refresh", async () => {
    const a = (await page("viewer", undefined, 11)).posts.map((p) => p.id);
    const b = (await page("viewer", undefined, 11)).posts.map((p) => p.id);
    // Position 1 is the featured post either way; compare the rest.
    const samePlace = a.slice(1).filter((id, i) => b[i + 1] === id).length;
    expect(samePlace).toBeLessThan(5);
  });

  it("shows a followers-only post to a follower", async () => {
    const { seen } = await walk("fan");
    expect(seen).toContain(followersOnlyId);
    expect(seen).toContain(hiddenId);
  });

  it("refuses a cursor it didn't issue with 400", async () => {
    await expect(page("viewer", "not-a-cursor")).rejects.toMatchObject({
      status: 400,
    });
    await expect(page("viewer", "not-a-cursor")).rejects.toBeInstanceOf(
      AppError,
    );
  });

  it("keeps Recent strictly newest-first, and no mode pinned-first", async () => {
    const recent = await FeedService.getFeed({
      mode: "recent",
      search: runId,
      limit: 50,
    });
    const times = recent.posts.map((p) => new Date(p.createdAt).getTime());
    expect(times).toEqual([...times].sort((x, y) => y - x));
    expect(recent.posts.map((p) => p.id)).not.toContain(pinnedId);

    const legacy = await FeedService.getFeed({
      mode: "legacy",
      search: runId,
      limit: 5,
    });
    expect(legacy.posts[0].id).toBe(pinnedId);
  });

  it("counts posts newer than a moment, without the viewer's own", async () => {
    // Scoped by author: other specs may post in parallel.
    const count = (viewer: string, author: string) =>
      FeedService.countNewPosts(
        { viewerId: ids[viewer], authorId: ids[author] },
        since,
      );
    const since = new Date();
    expect(await count("viewer", "c")).toBe(0);

    const create = (author: string, extra = {}) =>
      prisma.post.create({
        data: {
          authorId: ids[author],
          type: "citizen_experience",
          tab: "community",
          content: `${runId} brand new`,
          ...extra,
        },
      });
    await create("c");
    await create("viewer");
    await create("d", { visibility: "followers" });

    expect(await count("viewer", "c")).toBe(1);
    expect(await count("viewer", "viewer")).toBe(0); // their own
    expect(await count("c", "viewer")).toBe(1);
    expect(await count("viewer", "d")).toBe(0); // followers-only, not a follower
    expect(await count("fan", "d")).toBe(1);
  });
});
