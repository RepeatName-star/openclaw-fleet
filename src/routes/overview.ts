import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { RedisLike } from "../redis.js";

type OverviewRoutesOptions = {
  pool?: Pool;
  redis?: RedisLike;
};

export async function registerOverviewRoutes(
  app: FastifyInstance,
  opts: OverviewRoutesOptions,
) {
  app.get("/v1/overview", async (_request, reply) => {
    if (!opts.pool || !opts.redis) {
      reply.code(500).send({ error: "server not configured" });
      return;
    }

    const instancesRes = await opts.pool.query("select id from instances");
    let instancesOnline = 0;
    for (const row of instancesRes.rows) {
      const online = await opts.redis.get(`hb:${row.id}`);
      if (online) {
        instancesOnline += 1;
      }
    }

    const taskCounts = await opts.pool.query(
      `select
         count(*)::int as tasks_total,
         sum(case when status = 'pending' then 1 else 0 end)::int as tasks_pending,
         sum(case when status = 'leased' then 1 else 0 end)::int as tasks_leased,
         sum(case when status = 'done' then 1 else 0 end)::int as tasks_done,
         sum(case when status = 'error' then 1 else 0 end)::int as tasks_error
       from tasks`,
    );
    const campaignCounts = await opts.pool.query(
      "select count(*)::int as campaigns_open from campaigns where status = 'open'",
    );
    const bundleCounts = await opts.pool.query(
      "select count(*)::int as skill_bundles_total from skill_bundles",
    );

    reply.send({
      instances_total: instancesRes.rowCount,
      instances_online: instancesOnline,
      tasks_total: taskCounts.rows[0]?.tasks_total ?? 0,
      tasks_pending: taskCounts.rows[0]?.tasks_pending ?? 0,
      tasks_leased: taskCounts.rows[0]?.tasks_leased ?? 0,
      tasks_done: taskCounts.rows[0]?.tasks_done ?? 0,
      tasks_error: taskCounts.rows[0]?.tasks_error ?? 0,
      campaigns_open: campaignCounts.rows[0]?.campaigns_open ?? 0,
      skill_bundles_total: bundleCounts.rows[0]?.skill_bundles_total ?? 0,
    });
  });
}
