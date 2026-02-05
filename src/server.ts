import Fastify from "fastify";
import type { Pool } from "pg";
import type { AppConfig } from "./config";
import { registerEnrollRoutes } from "./routes/enroll";
import { registerHealthRoutes } from "./routes/health";

type ServerOptions = {
  config?: AppConfig;
  pool?: Pool;
};

export async function buildServer(options: ServerOptions = {}) {
  const app = Fastify({ logger: false });
  await registerHealthRoutes(app);
  await registerEnrollRoutes(app, options);
  return app;
}
