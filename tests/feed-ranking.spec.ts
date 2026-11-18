import { describe, it, expect } from "vitest";
import {
  AUTHOR_WINDOW,
  MAX_OFFSET,
  MAX_PER_AUTHOR_IN_WINDOW,
  OLDER_EVERY,
  composeFeed,
  decodeForYouCursor,
  encodeForYouCursor,
  engagementBase,
  freshWeight,
  newSeed,
  olderWeight,
  pickFeatured,
  resurfaceBoost,
  unitHash,
  weightedOrder,
  type RankablePost,
} from "../src/utils/feed-ranking";

/**
 * app#308: the Republic feed returned the same order on every load. These pin
 * the For you rules with fixed seeds: the same session gives the same list, a
 * new session gives a new mix, and older posts keep coming back.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ANCHOR = new Date("2026-11-18T12:00:00.000Z");

function post(id: string, overrides: Partial<RankablePost> = {}): RankablePost {
  return {
    id,
    authorId: `author-${id}`,
    createdAt: new Date(ANCHOR.getTime() - HOUR),
    likesCount: 0,
    commentsCount: 0,
    sharesCount: 0,
    ...overrides,
  };
}

const ids = (list: { id: string }[]) => list.map((p) => p.id);

describe("unitHash", () => {
  it("is stable for a seed and key, strictly inside (0, 1), and changes with the seed", () => {
    const a = unitHash("00000000000000aa", "post-1");
    expect(unitHash("00000000000000aa", "post-1")).toBe(a);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(1);
    expect(unitHash("00000000000000bb", "post-1")).not.toBe(a);
  });

  it("newSeed gives 16 hex characters", () => {
    expect(newSeed()).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("weights", () => {
  it("engagement starts at 1 and weighs likes 2, comments 5, shares 10", () => {
    expect(engagementBase(post("a"))).toBe(1);
    expect(
      engagementBase(
        post("a", { likesCount: 3, commentsCount: 2, sharesCount: 1 }),
      ),
    ).toBe(1 + 6 + 10 + 10);
  });

  it("a fresh post loses half its weight every 24 hours, measured from the anchor", () => {
    const at = (hoursOld: number) =>
      freshWeight(
        post("a", {
          likesCount: 10,
          createdAt: new Date(ANCHOR.getTime() - hoursOld * HOUR),
        }),
        ANCHOR,
        false,
      );
    expect(at(0)).toBeCloseTo(21);
    expect(at(24)).toBeCloseTo(21 / 2);
    expect(at(48)).toBeCloseTo(21 / 4);
  });

  it("keeps decaying past 67 hours, where the old Top penalty stopped", () => {
    const w = (h: number) =>
      freshWeight(
        post("a", { createdAt: new Date(ANCHOR.getTime() - h * HOUR) }),
        ANCHOR,
        false,
      );
    expect(w(200)).toBeLessThan(w(100));
    expect(w(100)).toBeLessThan(w(70));
  });

  it("following the author multiplies the weight by 1.5", () => {
    const p = post("a", { likesCount: 4 });
    expect(freshWeight(p, ANCHOR, true)).toBeCloseTo(
      freshWeight(p, ANCHOR, false) * 1.5,
    );
  });
});

describe("resurfaceBoost", () => {
  const createdAt = new Date(ANCHOR.getTime() - 100 * DAY);
  const shownDaysAgo = (d: number) => new Date(ANCHOR.getTime() - d * DAY);

  it("grows ×1.25 per whole day since last shown, compounding", () => {
    expect(resurfaceBoost(shownDaysAgo(0), createdAt, ANCHOR)).toBe(1);
    expect(resurfaceBoost(shownDaysAgo(0.9), createdAt, ANCHOR)).toBe(1);
    expect(resurfaceBoost(shownDaysAgo(1), createdAt, ANCHOR)).toBe(1.25);
    expect(resurfaceBoost(shownDaysAgo(2), createdAt, ANCHOR)).toBeCloseTo(
      1.5625,
    );
    expect(resurfaceBoost(shownDaysAgo(5), createdAt, ANCHOR)).toBeCloseTo(
      1.25 ** 5,
    );
  });

  it("is capped at ×10", () => {
    expect(resurfaceBoost(shownDaysAgo(10), createdAt, ANCHOR)).toBeLessThan(
      10,
    );
    expect(resurfaceBoost(shownDaysAgo(11), createdAt, ANCHOR)).toBe(10);
    expect(resurfaceBoost(shownDaysAgo(400), createdAt, ANCHOR)).toBe(10);
  });

  it("counts from the post's creation when it was never resurfaced", () => {
    const recent = new Date(ANCHOR.getTime() - 3 * DAY);
    expect(resurfaceBoost(null, recent, ANCHOR)).toBeCloseTo(1.25 ** 3);
  });

  it("treats a resurfacing after the anchor as none yet (×1, never below)", () => {
    const later = new Date(ANCHOR.getTime() + HOUR);
    expect(resurfaceBoost(later, createdAt, ANCHOR)).toBe(1);
  });

  it("older weight is engagement × boost, with no age decay", () => {
    const p = post("a", { likesCount: 2, createdAt });
    expect(olderWeight(p, shownDaysAgo(2), ANCHOR)).toBeCloseTo(5 * 1.5625);
  });
});

describe("weightedOrder", () => {
  const items = Array.from({ length: 30 }, (_, i) => post(`p${i}`));

  it("gives the same order for the same seed", () => {
    const a = weightedOrder(items, () => 1, "00000000000000aa", "fresh");
    const b = weightedOrder(items, () => 1, "00000000000000aa", "fresh");
    expect(ids(a)).toEqual(ids(b));
  });

  it("gives a different order for a different seed", () => {
    const a = weightedOrder(items, () => 1, "00000000000000aa", "fresh");
    const b = weightedOrder(items, () => 1, "00000000000000bb", "fresh");
    expect(ids(a)).not.toEqual(ids(b));
    expect(new Set(ids(b))).toEqual(new Set(ids(a)));
  });

  it("usually puts a much heavier item first, but not always", () => {
    const pair = [post("light"), post("heavy")];
    const weight = (p: RankablePost) => (p.id === "heavy" ? 20 : 1);
    let heavyFirst = 0;
    const runs = 400;
    for (let i = 0; i < runs; i++) {
      const seed = i.toString(16).padStart(16, "0");
      if (weightedOrder(pair, weight, seed, "fresh")[0].id === "heavy")
        heavyFirst++;
    }
    // Exact odds are 20/21 ≈ 95%.
    expect(heavyFirst / runs).toBeGreaterThan(0.9);
    expect(heavyFirst).toBeLessThan(runs);
  });
});

describe("pickFeatured", () => {
  it("returns null with nothing pinned", () => {
    expect(pickFeatured([], "00000000000000aa")).toBeNull();
  });

  it("rotates among the pinned posts across sessions", () => {
    const pinned = [post("f1"), post("f2"), post("f3")];
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      seen.add(
        pickFeatured(pinned, i.toString(16).padStart(16, "0"))?.id ?? "",
      );
    }
    expect(seen).toEqual(new Set(["f1", "f2", "f3"]));
  });

  it("is stable within a session", () => {
    const pinned = [post("f1"), post("f2"), post("f3")];
    expect(pickFeatured(pinned, "00000000000000aa")).toBe(
      pickFeatured(pinned, "00000000000000aa"),
    );
  });
});

describe("composeFeed", () => {
  const freshPool = (n: number) =>
    Array.from({ length: n }, (_, i) => post(`f${i}`));
  const olderPool = (n: number) =>
    Array.from({ length: n }, (_, i) => post(`o${i}`));

  it("puts an older post in every 4th position and never first", () => {
    const list = composeFeed({
      featured: null,
      fresh: freshPool(30),
      older: olderPool(10),
    });
    expect(list).toHaveLength(40);
    list.forEach((entry, i) => {
      expect(entry.resurfaced).toBe((i + 1) % OLDER_EVERY === 0);
    });
    expect(list[0].resurfaced).toBe(false);
  });

  it("puts the featured post first and counts it as position 1", () => {
    const list = composeFeed({
      featured: post("pinned"),
      fresh: freshPool(10),
      older: olderPool(5),
    });
    expect(list[0]).toMatchObject({ featured: true, resurfaced: false });
    expect(list[0].post.id).toBe("pinned");
    expect(list[3].resurfaced).toBe(true);
    expect(list.filter((e) => e.featured)).toHaveLength(1);
  });

  it("fills from the other pool when one runs out, losing nothing", () => {
    const fewOlder = composeFeed({
      featured: null,
      fresh: freshPool(12),
      older: olderPool(1),
    });
    expect(fewOlder).toHaveLength(13);
    expect(fewOlder.filter((e) => e.resurfaced)).toHaveLength(1);

    const noFresh = composeFeed({
      featured: null,
      fresh: [],
      older: olderPool(5),
    });
    expect(noFresh.map((e) => e.post.id)).toEqual([
      "o0",
      "o1",
      "o2",
      "o3",
      "o4",
    ]);
    expect(noFresh.every((e) => e.resurfaced)).toBe(true);
  });

  // One author's posts ranked at the very top of the pool, as after a burst of
  // posting. 6 of 40 fits the rules (2 per block × 4 blocks).
  const burst = (busy: number, total: number) =>
    Array.from({ length: total }, (_, i) =>
      post(`f${i}`, { authorId: i < busy ? "busy" : `a${i}` }),
    );
  const busyPerBlock = (list: { post: RankablePost }[]) =>
    Array.from(
      { length: Math.ceil(list.length / AUTHOR_WINDOW) },
      (_, b) =>
        list
          .slice(b * AUTHOR_WINDOW, (b + 1) * AUTHOR_WINDOW)
          .filter((e) => e.post.authorId === "busy").length,
    );

  it("never shows two posts in a row from one author when another fits", () => {
    const list = composeFeed({
      featured: null,
      fresh: burst(6, 40),
      older: [],
    });
    for (let i = 1; i < list.length; i++) {
      expect(
        list[i].post.authorId === "busy" &&
          list[i - 1].post.authorId === "busy",
      ).toBe(false);
    }
  });

  it(`allows at most ${MAX_PER_AUTHOR_IN_WINDOW} posts per author in each block of ${AUTHOR_WINDOW}`, () => {
    const list = composeFeed({
      featured: null,
      fresh: burst(6, 40),
      older: [],
    });
    expect(Math.max(...busyPerBlock(list))).toBeLessThanOrEqual(
      MAX_PER_AUTHOR_IN_WINDOW,
    );
    expect(new Set(list.map((e) => e.post.id)).size).toBe(40);
  });

  it("relaxes the spread only at the tail when one author has too many posts to fit", () => {
    // 10 of 20 can't fit 2 per block of 10: the extras wait until nothing
    // else is left, rather than being dropped.
    const list = composeFeed({
      featured: null,
      fresh: burst(10, 20),
      older: [],
    });
    expect(list).toHaveLength(20);
    expect(busyPerBlock(list)[0]).toBe(MAX_PER_AUTHOR_IN_WINDOW);
    const firstRun = list.findIndex(
      (e, i) =>
        i > 0 &&
        e.post.authorId === "busy" &&
        list[i - 1].post.authorId === "busy",
    );
    // Every non-busy post is placed before the rules have to give way.
    expect(
      list.slice(0, firstRun).filter((e) => e.post.authorId !== "busy"),
    ).toHaveLength(10);
  });

  it("still shows everything when only one author has posts", () => {
    const fresh = Array.from({ length: 5 }, (_, i) =>
      post(`f${i}`, { authorId: "solo" }),
    );
    const list = composeFeed({ featured: null, fresh, older: [] });
    expect(list.map((e) => e.post.id)).toEqual(["f0", "f1", "f2", "f3", "f4"]);
  });
});

describe("a whole session", () => {
  // The same steps the service runs, on in-memory posts.
  const fresh = Array.from({ length: 60 }, (_, i) =>
    post(`f${i}`, {
      authorId: `a${i % 12}`,
      likesCount: i % 7,
      createdAt: new Date(ANCHOR.getTime() - i * 3 * HOUR),
    }),
  );
  const older = Array.from({ length: 20 }, (_, i) =>
    post(`o${i}`, {
      authorId: `a${i % 9}`,
      commentsCount: i % 4,
      createdAt: new Date(ANCHOR.getTime() - (30 + i) * DAY),
    }),
  );
  const rank = (seed: string) =>
    composeFeed({
      featured: null,
      fresh: weightedOrder(
        fresh,
        (p) => freshWeight(p, ANCHOR, false),
        seed,
        "fresh",
      ),
      older: weightedOrder(
        older,
        (p) => olderWeight(p, null, ANCHOR),
        seed,
        "older",
      ),
    });

  it("rebuilds the identical list from the same seed, so pages never overlap or skip", () => {
    const seed = "00000000000000aa";
    const pages: string[] = [];
    for (let offset = 0; offset < 80; offset += 10) {
      pages.push(
        ...rank(seed)
          .slice(offset, offset + 10)
          .map((e) => e.post.id),
      );
    }
    expect(pages).toHaveLength(80);
    expect(new Set(pages).size).toBe(80);
    expect(pages).toEqual(rank(seed).map((e) => e.post.id));
  });

  it("shows a noticeably different top 10 after a refresh", () => {
    const top = (seed: string) =>
      rank(seed)
        .slice(0, 10)
        .map((e) => e.post.id);
    const a = top("00000000000000aa");
    const b = top("00000000000000bb");
    const samePlace = a.filter((id, i) => b[i] === id).length;
    expect(samePlace).toBeLessThan(5);
  });
});

describe("For you cursor", () => {
  const now = new Date(ANCHOR.getTime() + 10 * 60 * 1000);
  const valid = { seed: "0123456789abcdef", anchor: ANCHOR, offset: 20 };
  const raw = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");

  it("round-trips", () => {
    expect(decodeForYouCursor(encodeForYouCursor(valid), now)).toEqual(valid);
  });

  it("refuses anything it didn't issue", () => {
    const base = { v: 1, s: valid.seed, a: ANCHOR.toISOString(), o: 20 };
    expect(decodeForYouCursor("not-a-cursor", now)).toBeNull();
    expect(
      decodeForYouCursor("3f2a9c1e-0000-4000-8000-000000000000", now),
    ).toBeNull();
    expect(decodeForYouCursor(raw({ ...base, v: 2 }), now)).toBeNull();
    expect(decodeForYouCursor(raw({ ...base, s: "XYZ" }), now)).toBeNull();
    expect(
      decodeForYouCursor(raw({ ...base, a: "yesterday" }), now),
    ).toBeNull();
    expect(decodeForYouCursor(raw({ ...base, o: -1 }), now)).toBeNull();
    expect(decodeForYouCursor(raw({ ...base, o: 1.5 }), now)).toBeNull();
    expect(
      decodeForYouCursor(raw({ ...base, o: MAX_OFFSET + 1 }), now),
    ).toBeNull();
    expect(decodeForYouCursor(raw([1, 2]), now)).toBeNull();
  });

  it("refuses an anchor in the future or more than a day old", () => {
    const at = (ms: number) =>
      encodeForYouCursor({ ...valid, anchor: new Date(ms) });
    expect(
      decodeForYouCursor(at(now.getTime() + 5 * 60 * 1000), now),
    ).toBeNull();
    expect(decodeForYouCursor(at(now.getTime() - DAY - 1000), now)).toBeNull();
    expect(
      decodeForYouCursor(at(now.getTime() + 30 * 1000), now),
    ).not.toBeNull();
  });
});
