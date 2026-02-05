import { Redis } from "ioredis";

export type RedisLike = {
  set: (...args: any[]) => Promise<unknown>;
};

export function createRedis(redisUrl: string) {
  return new Redis(redisUrl);
}
