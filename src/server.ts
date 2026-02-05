import Fastify from "fastify";
import { registerHealthRoutes } from "./routes/health";

export async function buildServer() {
  const app = Fastify({ logger: false });
  await registerHealthRoutes(app);
  return app;
}
