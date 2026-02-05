import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { RedisLike } from "../redis";
import { requireDeviceToken } from "../auth";

type HeartbeatOptions = {
  pool?: Pool;
  redis?: RedisLike;
};

export async function registerHeartbeatRoutes(app: FastifyInstance, opts: HeartbeatOptions) {
  app.post(
    "/v1/heartbeat",
    async (request, reply) => {
      if (!opts.pool || !opts.redis) {
        reply.code(500).send({ error: "server not configured" });
        return;
      }
      await requireDeviceToken(opts.pool, request, reply);
      if (!request.device) {
        return;
      }
      const instanceId = request.device.instanceId;
      await opts.redis.set(`hb:${instanceId}`, "1", "EX", 60);
      await opts.pool.query("update instances set updated_at = now() where id = $1", [
        instanceId,
      ]);
      reply.send({ ok: true });
    },
  );
}
