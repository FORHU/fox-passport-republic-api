import RedisUtil from "./redis.util";

export const getCacheOrFetch = async <T>(hashKey: string, prefix: string, fetchFunction: () => Promise<T>): Promise<T> => {
  const cacheData = await RedisUtil.getCache(hashKey, prefix);
  if (cacheData) {
    return JSON.parse(cacheData) as T;
  }

  const data = await fetchFunction();
  await RedisUtil.saveCache({ key: hashKey, data: JSON.stringify(data), prefix });
  return data;
};
