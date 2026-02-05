import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.string().optional(),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  ENROLLMENT_SECRET: z.string().min(1),
});

export type AppConfig = {
  port: number;
  databaseUrl: string;
  redisUrl: string;
  enrollmentSecret: string;
};

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error("invalid configuration");
  }
  const rawPort = parsed.data.PORT?.trim();
  const port = rawPort ? Number(rawPort) : 3000;
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error("invalid PORT");
  }
  return {
    port,
    databaseUrl: parsed.data.DATABASE_URL,
    redisUrl: parsed.data.REDIS_URL,
    enrollmentSecret: parsed.data.ENROLLMENT_SECRET,
  };
}
