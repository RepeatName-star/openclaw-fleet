import Fastify from "fastify";
import fs from "node:fs";
import path from "node:path";
import fastifyStatic from "@fastify/static";
import type { Pool } from "pg";
import type { AppConfig } from "./config.js";
import type { RedisLike } from "./redis.js";
import { registerCampaignRoutes } from "./routes/campaigns.js";
import { registerArtifactsRoutes } from "./routes/artifacts.js";
import { registerEventsRoutes } from "./routes/events.js";
import { registerEnrollRoutes } from "./routes/enroll.js";
import { registerGroupsRoutes } from "./routes/groups.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerHeartbeatRoutes } from "./routes/heartbeat.js";
import { registerInstanceFilesRoutes } from "./routes/instance-files.js";
import { registerInstanceRoutes } from "./routes/instances.js";
import { registerInstanceToolsRoutes } from "./routes/instance-tools.js";
import { registerLabelsRoutes } from "./routes/labels.js";
import { registerOverviewRoutes } from "./routes/overview.js";
import { registerTasksAckRoutes } from "./routes/tasks-ack.js";
import { registerTasksAdminRoutes } from "./routes/tasks-admin.js";
import { registerTasksPullRoutes } from "./routes/tasks-pull.js";
import { registerTasksQueryRoutes } from "./routes/tasks-query.js";
import { registerSkillBundleRoutes } from "./routes/skill-bundles.js";

type ServerOptions = {
  config?: AppConfig;
  pool?: Pool;
  redis?: RedisLike;
  mailFetch?: typeof fetch;
};

export async function buildServer(options: ServerOptions = {}) {
  const app = Fastify({ logger: false });
  await registerHealthRoutes(app);
  await registerEnrollRoutes(app, options);
  await registerHeartbeatRoutes(app, options);
  await registerOverviewRoutes(app, options);
  await registerInstanceFilesRoutes(app, options);
  await registerInstanceRoutes(app, options);
  await registerInstanceToolsRoutes(app, options);
  await registerLabelsRoutes(app, options);
  await registerGroupsRoutes(app, options);
  await registerCampaignRoutes(app, options);
  await registerEventsRoutes(app, options);
  await registerArtifactsRoutes(app, options);
  await registerSkillBundleRoutes(app, options);
  await registerTasksPullRoutes(app, options);
  await registerTasksAckRoutes(app, options);
  await registerTasksAdminRoutes(app, options);
  await registerTasksQueryRoutes(app, options);
  const uiRoot = path.resolve(process.cwd(), "dist", "ui");
  if (fs.existsSync(uiRoot)) {
    await app.register(fastifyStatic, { root: uiRoot, prefix: "/" });
    app.setNotFoundHandler((request, reply) => {
      if (request.method !== "GET") {
        reply.code(404).send({ error: "not found" });
        return;
      }
      reply.sendFile("index.html");
    });
  }
  return app;
}
