import crypto from "node:crypto";

/**
 * The For you feed's ranking (app#308), as pure functions so every rule can be
 * tested with a fixed seed. Nothing here touches the database.
 *
 * A feed session is `{ seed, anchor }`: the first page draws both, and every
 * later page carries them in its cursor. The same seed and anchor always give
 * the same list, so pages never duplicate or skip a post. A new session (a
 * refresh) gets a new seed and a different mix.
 */

export const FRESH_POOL_SIZE = 400;
export const OLDER_POOL_SIZE = 100;
/** Every 4th position (4, 8, 12...) is an older post; position 1 never is. */
export const OLDER_EVERY = 4;
export const HALF_LIFE_HOURS = 24;
/** Weight multiplier when the viewer follows the author or wrote the post. */
export const AFFINITY_MULTIPLIER = 1.5;
/** An older post's chance grows ×1.25 for each whole day it goes unshown... */
export const RESURFACE_BOOST_PER_DAY = 1.25;
/** ...up to ×10, reached after ~10.3 days. */
export const RESURFACE_BOOST_CAP = 10;
/** Whole days until the boost reaches its cap (11): an older row can't matter after that. */
export const RESURFACE_RETENTION_DAYS = Math.ceil(
  Math.log(RESURFACE_BOOST_CAP) / Math.log(RESURFACE_BOOST_PER_DAY),
);
export const AUTHOR_WINDOW = 10;
export const MAX_PER_AUTHOR_IN_WINDOW = 2;
/** The ranked list never holds more than both pools, plus a featured post. */
export const MAX_OFFSET = FRESH_POOL_SIZE + OLDER_POOL_SIZE + 1;
/** A session older than this is refused, so a cursor can't be kept forever. */
export const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Tolerated clock skew for an anchor that looks slightly in the future. */
const ANCHOR_SKEW_MS = 60 * 1000;

export interface RankablePost {
  id: string;
  authorId: string;
  createdAt: Date;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
}

export interface FeedSession {
  seed: string;
  anchor: Date;
}

export interface RankedEntry<T> {
  post: T;
  resurfaced: boolean;
  featured: boolean;
}

export function newSeed(): string {
  return crypto.randomBytes(8).toString("hex");
}

/**
 * A stable number in (0, 1) for `(seed, key)`. 48 bits of SHA-256 are plenty
 * for ordering a few hundred posts, and the half-step keeps it off 0 and 1.
 */
export function unitHash(seed: string, key: string): number {
  const digest = crypto.createHash("sha256").update(`${seed}:${key}`).digest();
  return (digest.readUIntBE(0, 6) + 0.5) / 2 ** 48;
}

/** Every post starts at 1, so one with no likes, comments or shares can still appear. */
export function engagementBase(p: RankablePost): number {
  return (
    1 +
    Math.max(0, p.likesCount) * 2 +
    Math.max(0, p.commentsCount) * 5 +
    Math.max(0, p.sharesCount) * 10
  );
}

/**
 * Fresh posts lose half their weight every 24 hours, measured against the
 * session's anchor (not the wall clock) so every page of a session agrees.
 * The decay never stops, unlike the old Top mode's capped penalty.
 */
export function freshWeight(
  p: RankablePost,
  anchor: Date,
  hasAffinity: boolean,
): number {
  const hoursOld = Math.max(
    0,
    (anchor.getTime() - p.createdAt.getTime()) / HOUR_MS,
  );
  return (
    engagementBase(p) *
    (hasAffinity ? AFFINITY_MULTIPLIER : 1) *
    0.5 ** (hoursOld / HALF_LIFE_HOURS)
  );
}

/**
 * ×1.25 for each whole day since the post was last resurfaced (or since it was
 * posted, if never), capped at ×10. Compounding, so a passed-over post
 * eventually beats well-liked ones; served again, it starts over at ×1.
 */
export function resurfaceBoost(
  lastShownAt: Date | null,
  createdAt: Date,
  anchor: Date,
): number {
  const since = (lastShownAt ?? createdAt).getTime();
  const days = Math.max(0, Math.floor((anchor.getTime() - since) / DAY_MS));
  return Math.min(RESURFACE_BOOST_PER_DAY ** days, RESURFACE_BOOST_CAP);
}

/** Older posts skip the age decay; their chance is engagement × the boost. */
export function olderWeight(
  p: RankablePost,
  lastShownAt: Date | null,
  anchor: Date,
): number {
  return engagementBase(p) * resurfaceBoost(lastShownAt, p.createdAt, anchor);
}

/**
 * Weighted random order without replacement (Efraimidis–Spirakis): each item's
 * key is u^(1/w) with u = unitHash(seed, id), compared here as ln(u)/w, which
 * orders the same and doesn't underflow. Heavier items usually lead, but any
 * order is possible, and a given seed always gives the same one.
 */
export function weightedOrder<T extends { id: string }>(
  items: readonly T[],
  weight: (item: T) => number,
  seed: string,
  salt: string,
): T[] {
  return items
    .map((item) => {
      const w = Math.max(weight(item), Number.MIN_VALUE);
      return { item, key: Math.log(unitHash(seed, `${salt}:${item.id}`)) / w };
    })
    .sort((a, b) => b.key - a.key || (a.item.id < b.item.id ? -1 : 1))
    .map((k) => k.item);
}

/** At most one featured post per session, rotating among the pinned ones by seed. */
export function pickFeatured<T extends { id: string }>(
  pinned: readonly T[],
  seed: string,
): T | null {
  let best: T | null = null;
  let bestU = Infinity;
  for (const p of pinned) {
    const u = unitHash(seed, `featured:${p.id}`);
    if (u < bestU) {
      bestU = u;
      best = p;
    }
  }
  return best;
}

/**
 * Builds the session's full list:
 * - The featured post, if any, goes in position 1.
 * - Positions 4, 8, 12... take the next older post, and the rest take the next
 *   fresh post. When one pool runs out, the other fills its slots.
 * - Author spread: no two posts in a row from one author, and at most 2 per
 *   author in each block of 10 positions. A slot looks ahead in its own pool
 *   first, then the other pool, and only breaks the rule when nothing fits.
 */
export function composeFeed<T extends RankablePost>(input: {
  featured: T | null;
  fresh: readonly T[];
  older: readonly T[];
}): RankedEntry<T>[] {
  const out: RankedEntry<T>[] = [];
  const fresh = [...input.fresh];
  const older = [...input.older];
  const authorCounts = new Map<string, number>();

  const fits = (p: T, position: number): boolean => {
    const previous = out[out.length - 1];
    if (previous && previous.post.authorId === p.authorId) return false;
    const block = Math.floor(position / AUTHOR_WINDOW);
    return (
      (authorCounts.get(`${block}:${p.authorId}`) ?? 0) <
      MAX_PER_AUTHOR_IN_WINDOW
    );
  };

  const place = (entry: RankedEntry<T>) => {
    const block = Math.floor(out.length / AUTHOR_WINDOW);
    const key = `${block}:${entry.post.authorId}`;
    authorCounts.set(key, (authorCounts.get(key) ?? 0) + 1);
    out.push(entry);
  };

  if (input.featured) {
    place({ post: input.featured, resurfaced: false, featured: true });
  }

  while (fresh.length > 0 || older.length > 0) {
    const position = out.length; // 0-based; the 1-based position is +1
    const wantsOlder = (position + 1) % OLDER_EVERY === 0;
    const pools: { list: T[]; resurfaced: boolean }[] = wantsOlder
      ? [
          { list: older, resurfaced: true },
          { list: fresh, resurfaced: false },
        ]
      : [
          { list: fresh, resurfaced: false },
          { list: older, resurfaced: true },
        ];

    let chosen: { list: T[]; index: number; resurfaced: boolean } | null = null;
    for (const pool of pools) {
      const index = pool.list.findIndex((p) => fits(p, position));
      if (index !== -1) {
        chosen = { list: pool.list, index, resurfaced: pool.resurfaced };
        break;
      }
    }
    if (!chosen) {
      // Nothing fits (e.g. one author left): keep the slot's own pool order.
      // The loop condition guarantees at least one pool still has posts.
      const pool = pools[0].list.length > 0 ? pools[0] : pools[1];
      chosen = { list: pool.list, index: 0, resurfaced: pool.resurfaced };
    }

    const [post] = chosen.list.splice(chosen.index, 1);
    place({ post, resurfaced: chosen.resurfaced, featured: false });
  }

  return out;
}

// ── Cursor ────────────────────────────────────────────────────────────────

export interface ForYouCursor extends FeedSession {
  offset: number;
}

export function encodeForYouCursor(c: ForYouCursor): string {
  return Buffer.from(
    JSON.stringify({
      v: 1,
      s: c.seed,
      a: c.anchor.toISOString(),
      o: c.offset,
    }),
  ).toString("base64url");
}

/**
 * Null for anything that isn't a cursor this server issued in the last day:
 * the controller answers that with 400 rather than silently starting over.
 */
export function decodeForYouCursor(
  raw: string,
  now: Date = new Date(),
): ForYouCursor | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { v, s, a, o } = parsed as Record<string, unknown>;
  if (v !== 1) return null;
  if (typeof s !== "string" || !/^[0-9a-f]{16}$/.test(s)) return null;
  if (typeof a !== "string") return null;
  const anchor = new Date(a);
  const anchorMs = anchor.getTime();
  if (Number.isNaN(anchorMs)) return null;
  if (anchorMs > now.getTime() + ANCHOR_SKEW_MS) return null;
  if (now.getTime() - anchorMs > SESSION_MAX_AGE_MS) return null;
  if (typeof o !== "number" || !Number.isInteger(o) || o < 0 || o > MAX_OFFSET)
    return null;
  return { seed: s, anchor, offset: o };
}
