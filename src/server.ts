import Fastify from "fastify";
import type { Pool } from "pg";
import type { AppConfig } from "./config";
import type { RedisLike } from "./redis";
import { registerEnrollRoutes } from "./routes/enroll";
import { registerHealthRoutes } from "./routes/health";
import { registerHeartbeatRoutes } from "./routes/heartbeat";
import { registerTasksPullRoutes } from "./routes/tasks-pull";

type ServerOptions = {
  config?: AppConfig;
  pool?: Pool;
  redis?: RedisLike;
};

export async function buildServer(options: ServerOptions = {}) {
  const app = Fastify({ logger: false });
  await registerHealthRoutes(app);
  await registerEnrollRoutes(app, options);
  await registerHeartbeatRoutes(app, options);
  await registerTasksPullRoutes(app, options);
  return app;
}
