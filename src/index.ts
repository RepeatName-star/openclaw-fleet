import { loadConfig } from "./config.js";
import { reconcileOpenCampaignsOnce } from "./campaigns/reconciler.js";
import { createPool } from "./db.js";
import { createRedis } from "./redis.js";
import { buildServer } from "./server.js";

const config = loadConfig(process.env);
const pool = createPool(config.databaseUrl);
const redis = createRedis(config.redisUrl);

const app = await buildServer({ config, pool, redis });
await app.listen({ port: config.port, host: "0.0.0.0" });

const address = app.server.address();
if (typeof address === "object" && address) {
  console.log(`listening on ${address.address}:${address.port}`);
}

const intervalRaw = Number(process.env.RECONCILE_INTERVAL_MS ?? "2000");
const intervalMs = Number.isFinite(intervalRaw) && intervalRaw > 0 ? intervalRaw : 2000;
setInterval(() => {
  void reconcileOpenCampaignsOnce(pool).catch(() => undefined);
}, intervalMs);
