import { createClient, RedisClientType } from "redis";

import { REDIS_HOST, REDIS_PASSWORD, REDIS_PORT } from "../config";

export default class RedisUtil {
  static redisClient: RedisClientType;

  /**
   * Initialize the Redis client.
   */
  static async initialize() {
    if (!this.redisClient) {
      this.redisClient = createClient({
        password: REDIS_PASSWORD,
        socket: {
          host: REDIS_HOST,
          port: REDIS_PORT,
        },
      });

      this.redisClient.on("error", (err) => console.error("Redis Error:", err));

      await this.redisClient.connect();
      console.log("Redis client connected.");
    }
  }

  /**
   * Get the Redis client connection.
   * @returns RedisClientType
   */
  static useConnection(): RedisClientType {
    if (!this.redisClient) {
      throw new Error("Redis client is not initialized. Call `initialize` first.");
    }
    return this.redisClient;
  }

  /**
   * Save a key-value pair in Redis with an optional expiry time.
   * @param key The key to save.
   * @param data The value to save.
   * @param prefix Optional prefix for the key (default: "cache").
   * @param expiry Optional expiry time in seconds (default: 1 hour).
   */

  static async saveCache({ key, data, expiry = 3600, prefix = "cache" }: { key: string; data: any; expiry?: number; prefix?: string }) {
    const client = this.useConnection();
    const fullKey = `${prefix}:${key}`;
    const keysSetName = `${prefix}:keys`;

    try {
      const multi = client.multi();

      multi.set(fullKey, JSON.stringify(data), { EX: expiry });

      multi.sAdd(keysSetName, key);
      multi.expire(keysSetName, expiry);

      await multi.exec();

      console.log(`Data cached with key: ${fullKey}`);
    } catch (err) {
      console.error("Error saving cache:", err);
      throw err;
    }
  }

  /**
   * Get a cached value from Redis by key.
   * @param key The key to fetch.
   * @param prefix Optional prefix for the key (default: "cache").
   * @returns The cached value or null if not found.
   */
  static async getCache(key: string, prefix = "cache"): Promise<any> {
    const client = this.useConnection();
    const fullKey = `${prefix}:${key}`;

    try {
      const data = await client.get(fullKey);
      return data ? JSON.parse(data) : null;
    } catch (err) {
      console.error("Error getting cache:", err);
      throw err;
    }
  }

  /**
   * Invalidate all cached data by prefix.
   * @param prefix Optional prefix for the keys (default: "cache").
   */

  static async invalidateByPrefix(prefix = "cache"): Promise<void> {
    const client = this.useConnection();

    try {
      const keys = await client.sMembers(`${prefix}:keys`);

      if (keys.length > 0) {
        const multi = client.multi();

        for (const key of keys) {
          multi.del(`${prefix}:${key}`);
        }

        multi.del(`${prefix}:keys`);

        await multi.exec();
        console.log(`Invalidated ${keys.length} keys with prefix: ${prefix}`);
      }
    } catch (err) {
      console.error("Error invalidating cache:", err);
      throw err;
    }
  }

  /**
   * Delete a cached value from Redis by key.
   * @param key The key to delete.
   * @returns Boolean indicating whether the deletion was successful.
   */
  static async deleteCache(key: string): Promise<boolean> {
    const client = this.useConnection();
    try {
      const result = await client.del(key);
      return result > 0;
    } catch (err) {
      console.error("Error deleting cache:", err);
      throw err;
    }
  }

  /**
   * Disconnect the Redis client (used for cleanup).
   */
  static async disconnect() {
    if (this.redisClient) {
      await this.redisClient.disconnect();
      console.log("Redis client disconnected.");
      this.redisClient = null;
    }
  }
}
