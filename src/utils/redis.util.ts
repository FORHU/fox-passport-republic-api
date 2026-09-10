import { createClient } from "redis";

/**
 * Read at connect time, not at import time.
 *
 * These were module-level constants for about an hour, and a smoke test caught
 * what that costs: this file is a leaf that `otp.utils` and `cache.util` pull
 * in, so it can be imported before anything has called `dotenv.config()` - and
 * then `.env` may as well not exist. It connected to a *different Redis* on the
 * default port and reported success.
 *
 * Reading here means the values are whatever the process has by the time
 * something actually connects, which is the same reason `redis.util` is asked
 * for its client per command rather than at construction elsewhere.
 *
 * Not from `config.ts` either: that module runs `dotenv.config()` and validates
 * the token secrets at import, and pulling it into every file that touches
 * Redis is a blast radius (and a `Math.random()` call from dotenv's banner,
 * which `auth.otp.spec` rightly objects to).
 *
 * `REDIS_PORT` is the port this process dials. In `docker-compose.yml` the
 * published host port is `REDIS_HOST_PORT`, deliberately a different name - one
 * variable meaning both things is how a mismatch becomes invisible.
 */
function redisConfig() {
  return {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || undefined,
  };
}

/**
 * How long to wait before the next connection attempt, or `false` to stop.
 *
 * Two situations wear this one callback, and nothing inside it distinguishes
 * them but `everConnected`: a socket that has never opened and a socket that
 * has closed look identical from here.
 *
 * **Before the first success**, giving up is what produces the clean no-Redis
 * state - `connect()` rejects, `initialize` nulls the client, and `getClient()`
 * returns null from then on, which every caller already short-circuits on. A
 * misconfigured port should not retry for the life of the process.
 *
 * **After a success**, Redis has been there once, so a closed socket is an
 * outage rather than a mistake and is worth waiting out. Giving up here was a
 * bug: `initialize` only nulls the client when the *initial* connect throws, so
 * a reconnect that gave up left `getClient()` handing out a closed client for
 * the life of the process - no caching and per-process rate limits, announced
 * once and never again. Found on 10 Sep by stopping Redis under a running API:
 * it never came back until the API was restarted. See `REDIS-PLAN.md` §3.
 *
 * Exported for the test, and pure so that the test does not need a socket.
 */
export function reconnectDelay(
  retries: number,
  everConnected: boolean,
): number | false {
  if (!everConnected && retries > 3) return false;
  return Math.min(retries * 200, 2000);
}

class RedisUtil {
  private client: ReturnType<typeof createClient> | null = null;

  /**
   * Whether a connection has ever succeeded on this client. The reconnect
   * strategy behaves differently either side of that line - see
   * `reconnectDelay`.
   */
  private everConnected = false;

  async initialize() {
    // Named before the attempt so both outcomes can say where it was dialling.
    // Everything here is fail-soft, so a wrong port is not an error - it is an
    // API that quietly runs with no cache and per-process rate limits. The
    // address is the one thing that makes that diagnosable from the logs.
    const { host, port, password } = redisConfig();
    const target = `${host}:${port}`;

    try {
      this.client = createClient({
        socket: {
          host,
          port,
          reconnectStrategy: (retries) => {
            const delay = reconnectDelay(retries, this.everConnected);
            if (delay === false) {
              console.warn("⚠️ Redis max retries reached. Giving up.");
            }
            return delay;
          },
        },
        password,
        /**
         * Fail commands immediately while the socket is down instead of
         * queueing them for a reconnect that may be minutes away.
         *
         * This is what makes retrying forever safe. Every caller here is
         * fail-soft on the assumption that a Redis command fails *fast* - a
         * cached read falls through to Postgres, the limiter falls back to
         * memory. With the default queue those calls would instead wait for the
         * reconnect, turning a Redis outage into a slow API, which is a worse
         * failure than the one this file exists to prevent.
         */
        disableOfflineQueue: true,
      });

      this.client.on("error", (err) => {
        if (!err.message?.includes("ECONNREFUSED")) {
          console.error("Redis Client Error:", err);
        }
      });

      // The recovery deserves a line of its own. Every degradation warning in
      // this codebase is latched to fire once, so without this nothing ever
      // says the cache came back.
      this.client.on("ready", () => {
        if (this.everConnected) {
          console.log(`✅ Redis reconnected (${target}) - caching resumed`);
        }
      });

      await this.client.connect();
      this.everConnected = true;
      console.log(`✅ Redis connected successfully (${target})`);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      console.error(
        `❌ Redis connection failed at ${target} — app will continue without ` +
          "Redis: no caching, and rate-limit counters go per-process",
      );
      this.client = null;
    }
  }

  getClient() {
    return this.client;
  }

  async disconnect() {
    if (this.client) {
      await this.client.disconnect();
    }
  }
}

export default new RedisUtil();
