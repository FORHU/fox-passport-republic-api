import { createClient } from "redis";

class RedisUtil {
  private client: ReturnType<typeof createClient> | null = null;

  async initialize() {
    try {
      this.client = createClient({
        socket: {
          host: process.env.REDIS_HOST || "127.0.0.1",
          port: parseInt(process.env.REDIS_PORT || "6379"),
          reconnectStrategy: (retries) => {
            if (retries > 3) {
              console.warn("⚠️ Redis max retries reached. Giving up.");
              return false;
            }
            return Math.min(retries * 200, 2000);
          },
        },
        password: process.env.REDIS_PASSWORD || undefined,
      });

      this.client.on("error", (err) => {
        if (!err.message?.includes("ECONNREFUSED")) {
          console.error("Redis Client Error:", err);
        }
      });

      await this.client.connect();
      console.log("✅ Redis connected successfully");
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      console.error(
        "❌ Redis connection failed — app will continue without Redis",
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
