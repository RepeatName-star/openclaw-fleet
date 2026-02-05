import { loadConfig } from "./config";
import { createPool } from "./db";
import { createRedis } from "./redis";
import { buildServer } from "./server";

const config = loadConfig(process.env);
const pool = createPool(config.databaseUrl);
const redis = createRedis(config.redisUrl);

const app = await buildServer({ config, pool, redis });
await app.listen({ port: config.port, host: "0.0.0.0" });

const address = app.server.address();
if (typeof address === "object" && address) {
  console.log(`listening on ${address.address}:${address.port}`);
}
