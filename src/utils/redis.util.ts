import { createClient } from "redis";

class RedisUtil {
  private client: ReturnType<typeof createClient> | null = null;

  async initialize() {
    try {
      this.client = createClient({
        socket: {
          host: process.env.REDIS_HOST || "127.0.0.1",
          port: parseInt(process.env.REDIS_PORT || "6379"),
        },
        password: process.env.REDIS_PASSWORD || undefined,
      });

      this.client.on("error", (err) => {
        console.error("Redis Client Error:", err);
      });

      await this.client.connect();
      console.log("✅ Redis connected successfully");
    } catch (error) {
      console.error("❌ Redis connection failed:", error);
      // Don't throw error - allow app to continue without Redis
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