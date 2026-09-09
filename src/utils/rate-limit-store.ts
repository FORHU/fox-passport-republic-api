import { MemoryStore } from "express-rate-limit";
import type {
  Store,
  Options,
  IncrementResponse,
  ClientRateLimitInfo,
} from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import redisUtil from "./redis.util";

/**
 * The backing store for the rate limiters.
 *
 * They ran on `express-rate-limit`'s default `MemoryStore`, which keeps its
 * counters in one process's heap. Two consequences, and the first is the one
 * that mattered:
 *
 *  - **a restart handed the budget back.** AUTH-01's per-account login limit is
 *    ten attempts in fifteen minutes; an attacker who spent it only had to wait
 *    for a deploy. Under `nodemon` every file save cleared it, so the limit was
 *    at its weakest exactly where it was being developed.
 *  - **counters were per process.** The Dockerfile runs the API in a container;
 *    every instance kept its own counters, so N instances meant N times every
 *    published limit.
 *
 * ## Why the store is resolved per request rather than at construction
 *
 * `setup()` in `app.ts` is called without `await`, and the limiters are built at
 * module load - so Redis is *never* connected at the moment these stores are
 * constructed. A store that captured the client on creation would capture
 * `null` every time. `sendCommand` asks `redisUtil` for the client on each
 * command instead.
 *
 * ## Why it falls back to memory instead of failing
 *
 * `redis.util.ts` is deliberately fail-soft - it logs "app will continue without
 * Redis" and hands out `null` rather than throwing. Honouring that here matters:
 * making the limiter hard-depend on Redis would turn a Redis outage into a
 * total API outage, trading a rate-limiting weakness for an availability one.
 * The fallback is a real downgrade - counters go per-process again, exactly the
 * old behaviour - but degraded limiting beats a dead API, and it is logged once
 * so it is not silent.
 *
 * The alternative express-rate-limit offers, `passOnStoreError`, is worse: it
 * lets every request through unlimited while Redis is down, which is the moment
 * a limiter is most likely to be needed.
 *
 * ## Why the `RedisStore` is built lazily, and why its `init` is watched
 *
 * The fallback above was defeated by the construction itself. In
 * rate-limit-redis v4 the constructor fired two `SCRIPT LOAD`s and stored their
 * promises for the first request to await. With no Redis they rejected with
 * nobody awaiting them - unhandled rejections, which Node terminates the
 * process for. **The API could not start without Redis at all**, which is the
 * precise outage this file exists to prevent.
 *
 * v6 moved those loads out of the constructor and into `init()`, which returns
 * a promise that `express-rate-limit` calls without awaiting. Same rejection,
 * one function along. So the store is still built on first use, once there is a
 * client, and whatever `init()` returns gets a catch attached. The failure then
 * surfaces where it can be handled - the first `increment`, which falls back to
 * memory.
 */

/**
 * Each limiter needs its own key space.
 *
 * With `MemoryStore` this was free - every `rateLimit()` call constructed its
 * own store, so the buckets could not touch. One shared Redis removes that
 * isolation: the per-account login limiter and the per-account OTP-verify
 * limiter key on the same normalised email, so without distinct prefixes a
 * user's failed sign-ins would spend their password-reset budget and vice
 * versa. The prefix is what restores the isolation the old store gave by
 * accident.
 */
/**
 * Marks a promise as handled without changing what it does.
 *
 * `Store.init` is typed as returning `void`, and express-rate-limit calls it
 * that way - but rate-limit-redis's is `async`, so it returns a promise that
 * nothing awaits. An unhandled rejection there ends the process. The value is
 * awaited again where it matters, inside `increment`, which is where a failure
 * should be handled rather than here.
 */
function suppress(maybePromise: unknown): void {
  if (maybePromise instanceof Promise) maybePromise.catch(() => {});
}

export function createRateLimitStore(prefix: string): Store {
  return new ResilientStore(prefix);
}

class ResilientStore implements Store {
  private readonly memory: MemoryStore;
  private readonly keyPrefix: string;
  private redis: RedisStore | null = null;
  private options: Options | null = null;
  private warned = false;

  constructor(prefix: string) {
    this.keyPrefix = `rl:${prefix}:`;
    this.memory = new MemoryStore();
  }

  init(options: Options): void {
    // `windowMs` lives in here, so an uninitialised store would expire nothing.
    // Held as well as applied: the Redis store may not exist yet, and it has to
    // be initialised with the same options whenever it does.
    this.options = options;
    this.memory.init(options);
    suppress(this.redis?.init?.(options));
  }

  /**
   * The Redis-backed store, or null while there is no client.
   *
   * Built here rather than in the constructor - see the note above on why
   * building it without a client killed the process.
   */
  private redisStore(): RedisStore | null {
    if (!redisUtil.getClient()) return null;
    if (this.redis) return this.redis;

    const store = new RedisStore({
      prefix: this.keyPrefix,
      sendCommand: (...args: string[]) => {
        const client = redisUtil.getClient();
        // Reached only when this method already saw a client, so this is a race
        // (a disconnect between the check and the command) rather than the
        // ordinary no-Redis path. Rejecting sends it to the catch below.
        if (!client) return Promise.reject(new Error("Redis unavailable"));
        return client.sendCommand(args) as Promise<never>;
      },
    });

    if (this.options) suppress(store.init?.(this.options));
    this.redis = store;
    return store;
  }

  private fallback(error: unknown): void {
    if (this.warned) return;
    this.warned = true;
    console.warn(
      "⚠️  Rate limiting fell back to in-memory counters - Redis is unavailable. " +
        "Limits are now per-process and reset on restart.",
      error instanceof Error ? error.message : error,
    );
  }

  async increment(key: string): Promise<IncrementResponse> {
    const redis = this.redisStore();
    if (!redis) return this.memory.increment(key);
    try {
      return await redis.increment(key);
    } catch (error) {
      this.fallback(error);
      return this.memory.increment(key);
    }
  }

  async decrement(key: string): Promise<void> {
    // `skipSuccessfulRequests` refunds a hit through here, so a decrement that
    // silently failed would leave successful sign-ins counted against the
    // failure-only budgets.
    const redis = this.redisStore();
    if (!redis) return this.memory.decrement(key);
    try {
      await redis.decrement(key);
    } catch (error) {
      this.fallback(error);
      await this.memory.decrement(key);
    }
  }

  async resetKey(key: string): Promise<void> {
    const redis = this.redisStore();
    if (!redis) return this.memory.resetKey(key);
    try {
      await redis.resetKey(key);
    } catch (error) {
      this.fallback(error);
      await this.memory.resetKey(key);
    }
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    const redis = this.redisStore();
    if (!redis) return this.memory.get(key);
    try {
      return await redis.get(key);
    } catch (error) {
      this.fallback(error);
      return this.memory.get(key);
    }
  }
}
