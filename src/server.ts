import Fastify from "fastify";
import type { Pool } from "pg";
import type { AppConfig } from "./config.js";
import type { RedisLike } from "./redis.js";
import { registerEnrollRoutes } from "./routes/enroll.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerHeartbeatRoutes } from "./routes/heartbeat.js";
import { registerTasksAckRoutes } from "./routes/tasks-ack.js";
import { registerTasksAdminRoutes } from "./routes/tasks-admin.js";
import { registerTasksPullRoutes } from "./routes/tasks-pull.js";

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
  await registerTasksAckRoutes(app, options);
  await registerTasksAdminRoutes(app, options);
  return app;
}
