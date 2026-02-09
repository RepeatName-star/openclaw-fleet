import { Redis } from "ioredis";

export type RedisLike = {
  set: (...args: any[]) => Promise<unknown>;
  get: (...args: any[]) => Promise<string | null>;
};

export function createRedis(redisUrl: string) {
  return new Redis(redisUrl);
}
