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

class RedisUtil {
  private client: ReturnType<typeof createClient> | null = null;

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
            if (retries > 3) {
              console.warn("⚠️ Redis max retries reached. Giving up.");
              return false;
            }
            return Math.min(retries * 200, 2000);
          },
        },
        password,
      });

      this.client.on("error", (err) => {
        if (!err.message?.includes("ECONNREFUSED")) {
          console.error("Redis Client Error:", err);
        }
      });

      await this.client.connect();
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
