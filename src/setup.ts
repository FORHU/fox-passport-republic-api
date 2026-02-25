import RedisUtil from "./utils/redis.util";
import { connectToPrisma } from "./utils/prisma";

export default async () => {
  await RedisUtil.initialize();
  await connectToPrisma();
};
