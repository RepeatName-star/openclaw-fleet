import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { RedisLike } from "../redis.js";
import { requireDeviceToken } from "../auth.js";

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
      await opts.redis.set(`hb:${instanceId}`, "1", "EX", 90);
      await opts.pool.query(
        "update instances set updated_at = now(), last_seen_ip = $2 where id = $1",
        [instanceId, request.ip ?? null],
      );
      reply.send({ ok: true });
    },
  );
}
