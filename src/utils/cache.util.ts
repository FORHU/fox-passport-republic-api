import crypto from "crypto";
import type { Prisma } from "@prisma/client";
import redisUtil from "./redis.util";

/**
 * A fixed-length key fragment for a filter object that is too long, too
 * variable or too caller-influenced to spell into a key.
 *
 * The rule that makes this safe is that the hashed value must be the *whole*
 * identity of the answer - including any viewer scoping already folded into it.
 * Two callers who produce the same fingerprint are then entitled to the same
 * rows by construction, rather than by a reviewer noticing.
 *
 * `JSON.stringify` is stable enough here because these objects are built by our
 * own `buildFilters`-style code in a fixed order, not parsed from user input.
 */
export function fingerprint(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

/**
 * Read-through caching for the service layer.
 *
 * Caching lives in services - never controllers, never repositories - and the
 * shape every call site follows is in `docs/REDIS-PLAN.md` §0. In short:
 * anything an operator watches for their own write to appear in is invalidated
 * at the write; anything nobody watches gets a TTL and says so.
 *
 * A read is a good candidate when it is all three of:
 *
 *  - **expensive** - several aggregates or unindexable scans, not a key lookup;
 *  - **shared** - the same key gives every caller the same answer, so one fill
 *    serves everyone rather than one user warming their own entry;
 *  - **slow-changing** - a bounded TTL is an acceptable answer to staleness.
 *
 * That is guidance for choosing a TTL and for deciding whether invalidation has
 * to be wired, not a gate on whether a read may be cached at all. A read that
 * fails the third test needs its writes to invalidate it.
 */

/**
 * What a JSON round-trip does to a value, as a type.
 *
 * A cached value is stored as JSON, so a `Date` comes back as a string and a
 * `Prisma.Decimal` comes back as the string its own `toJSON` produced. The HTTP
 * responses are unaffected - `res.json()` does the same thing to both - but an
 * *in-process* caller that reaches for `.toISOString()` on a cached booking
 * gets a `TypeError` at runtime, and the plain type says nothing about it.
 * `booking.controller.ts` had exactly that call, inside a `try` that would have
 * swallowed the failure as "could not send the confirmation email".
 *
 * So `cached` returns this instead, and the mistake is a compile error. The
 * admin dashboard's hand-serialised `totalRevenue` was the same problem caught
 * by hand once; this is that fix generalised.
 */
export type Jsonified<T> = T extends Date | Prisma.Decimal
  ? string
  : T extends (infer U)[]
    ? Jsonified<U>[]
    : T extends object
      ? { [K in keyof T]: Jsonified<T[K]> }
      : T;

/**
 * The type above is only honest if *every* path produces that shape, so a miss
 * round-trips through JSON too - including when Redis is absent entirely.
 *
 * Paying a serialise on the miss path buys the property that makes this safe to
 * use widely: **a cached read returns the same shape whether Redis is there or
 * not.** Without it, dev (no Redis) and production (Redis) would disagree about
 * whether a field is a `Date` or a string, which is the kind of difference that
 * is found in production rather than in a test.
 *
 * A `BigInt` cannot be written at all and throws here rather than quietly
 * differing. Nothing cached today has one.
 */
function shaped<T>(value: T): Jsonified<T> {
  return JSON.parse(JSON.stringify(value)) as Jsonified<T>;
}

/**
 * Redis being down is one event, not one event per request.
 *
 * `redis.util` stops reconnecting after three attempts but keeps handing out
 * the dead client, so `getClient()` never returns null again and every cached
 * read keeps trying and failing. Warning on each of them buries the line that
 * explains the outage under thousands that repeat it. The rate-limit store
 * already warns exactly once for this reason; this is the same latch.
 *
 * It resets on the first success, so a Redis that comes back and goes away
 * again is reported again.
 */
let warned = false;

function warnOnce(message: string, error: unknown): void {
  if (warned) return;
  warned = true;
  console.warn(message, error);
}

function healthy(): void {
  warned = false;
}

export async function cached<T>(
  key: string,
  ttlSeconds: number,
  produce: () => Promise<T>,
): Promise<Jsonified<T>> {
  const client = redisUtil.getClient();
  // No Redis is not an error - `redis.util` is fail-soft by design and the app
  // is expected to run without it. Compute and move on.
  if (!client) return shaped(await produce());

  try {
    const hit = await client.get(`cache:${key}`);
    healthy();
    if (hit !== null) return JSON.parse(hit) as Jsonified<T>;
  } catch (error) {
    // A cache must never be able to fail a request it was only meant to speed
    // up. Fall through to the real query.
    warnOnce(`Cache read failed for ${key}`, error);
    return shaped(await produce());
  }

  const value = await produce();
  const serialised = JSON.stringify(value);

  try {
    await client.set(`cache:${key}`, serialised, { EX: ttlSeconds });
  } catch (error) {
    // The caller already has its answer; failing to store it is not its problem.
    warnOnce(`Cache write failed for ${key}`, error);
  }

  return JSON.parse(serialised) as Jsonified<T>;
}

/**
 * Drops cached entries by key.
 *
 * TTL-only entries are for values nobody watches for their own write to appear
 * in. Admin queues are the opposite: an admin resolves a dispute and expects it
 * gone from the list on the next load, so those are invalidated at the point of
 * the write rather than left to expire. A cache an operator has learned to
 * distrust is worse than no cache.
 *
 * Failures are swallowed. A dropped invalidation means a stale read until the
 * TTL expires, which is bad; throwing here would fail the write that already
 * succeeded, which is worse.
 */
export async function invalidate(...keys: string[]): Promise<void> {
  const client = redisUtil.getClient();
  if (!client || keys.length === 0) return;

  try {
    await client.del(keys.map((k) => `cache:${k}`));
  } catch (error) {
    warnOnce(`Cache invalidation failed for ${keys.join(", ")}`, error);
  }
}

/**
 * A cache for reads whose keys cannot be listed at invalidation time.
 *
 * `invalidate` has to name every key it drops, which works for the admin queues
 * - there are six and they are constants. It does not work for a paginated,
 * filtered, per-user list: those keys carry a page number, a page size, a user
 * id and a hash of the caller's filters, so the set of keys that exist for
 * "this user's bookings" is unbounded and unknowable from the write path. Redis
 * has `SCAN`, but scanning the keyspace on every booking write is a worse
 * problem than the one it solves.
 *
 * So the keys carry a version and invalidation increments the version rather
 * than deleting anything. Every key formed after a bump is one nothing has
 * written yet, so every read misses and refills, and the orphaned entries
 * expire on their own TTLs. One `INCR` retires an unbounded key set in O(1) -
 * and, the reason this is the safer design rather than merely the cheaper one,
 * there is exactly **one** invalidation point per namespace to get right
 * instead of one per key shape.
 *
 * Two costs, both accepted:
 *
 *  - **an extra `GET` per read**, for the version. The same round-trip class as
 *    the read it precedes.
 *  - **it is blunt.** A bump retires every entry in the namespace, including
 *    other users'. For something as write-heavy and as closely watched as a
 *    booking, a colder cache in exchange for an invalidation that cannot be
 *    missed is the right way round.
 *
 * If the version key is ever lost - eviction, a flushed Redis - reads fall back
 * to version 0 and could in principle reuse keys written under version 0 long
 * ago. They cannot in practice: every entry here carries a TTL, so anything
 * written under an earlier counter has expired by the time the counter is gone.
 */
export function versionedCache(namespace: string) {
  // Distinct from the entry prefix `cache:<namespace>:<version>:`, so a version
  // key can never collide with an entry key.
  const versionKey = `cache:version:${namespace}`;

  return {
    async cached<T>(
      key: string,
      ttlSeconds: number,
      produce: () => Promise<T>,
    ): Promise<Jsonified<T>> {
      const client = redisUtil.getClient();
      if (!client) return shaped(await produce());

      let version: string;
      try {
        version = (await client.get(versionKey)) ?? "0";
        healthy();
      } catch (error) {
        // Without a version there is no key that is safe to read, and guessing
        // one risks serving an entry that a bump was supposed to retire.
        warnOnce(`Cache version read failed for ${namespace}`, error);
        return shaped(await produce());
      }

      return cached(`${namespace}:${version}:${key}`, ttlSeconds, produce);
    },

    /** Retires every entry in the namespace. Called by the writes. */
    async invalidateAll(): Promise<void> {
      const client = redisUtil.getClient();
      if (!client) return;

      try {
        await client.incr(versionKey);
      } catch (error) {
        // Same reasoning as `invalidate`: a failed bump means stale reads until
        // the TTL, and throwing would fail a write that already succeeded.
        warnOnce(`Cache version bump failed for ${namespace}`, error);
      }
    },
  };
}
