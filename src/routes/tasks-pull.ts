import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { RedisLike } from "../redis.js";
import { requireDeviceToken } from "../auth.js";

const PullSchema = z.object({
  limit: z.number().int().min(1).max(50).optional(),
});

type TasksPullOptions = {
  pool?: Pool;
  redis?: RedisLike;
};

export async function registerTasksPullRoutes(app: FastifyInstance, opts: TasksPullOptions) {
  app.post("/v1/tasks/pull", async (request, reply) => {
    if (!opts.pool || !opts.redis) {
      reply.code(500).send({ error: "server not configured" });
      return;
    }
    await requireDeviceToken(opts.pool, request, reply);
    if (!request.device) {
      return;
    }

    const parsed = PullSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid payload" });
      return;
    }

    const limit = parsed.data.limit ?? 10;
    const instanceId = request.device.instanceId;
    const groups = await opts.pool.query(
      "select group_id from group_instances where instance_id = $1",
      [instanceId],
    );
    const groupIds = groups.rows.map((row: { group_id: string }) => row.group_id as string);

    const candidates = await opts.pool.query(
      "select * from tasks where status = 'pending' and (target_type = 'instance' and target_id = $1 or target_type = 'group' and target_id = any($2::text[])) and (expires_at is null or expires_at > now()) order by created_at asc limit $3",
      [instanceId, groupIds, limit],
    );

    const leased = [] as Array<Record<string, unknown>>;
    for (const row of candidates.rows) {
      const leaseKey = `task:${row.id}:lease`;
      const lease = await opts.redis.set(leaseKey, instanceId, "PX", 30000, "NX");
      if (!lease) {
        continue;
      }
      await opts.pool.query(
        "update tasks set status = 'leased', attempts = attempts + 1, lease_expires_at = now() + interval '30 seconds', updated_at = now() where id = $1",
        [row.id],
      );
      leased.push({
        id: row.id,
        action: row.action,
        payload: row.payload,
        target_type: row.target_type,
        target_id: row.target_id,
      });
    }

    reply.send({ tasks: leased });
  });
}
