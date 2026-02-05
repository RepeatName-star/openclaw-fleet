import Redis from "ioredis";

export type RedisLike = {
  set: (key: string, value: string, ...args: Array<string | number>) => Promise<unknown>;
};

export function createRedis(redisUrl: string) {
  return new Redis(redisUrl);
}
