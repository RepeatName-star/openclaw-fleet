import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";

const QuerySchema = z.object({
  status: z.string().optional(),
  action: z.string().optional(),
  target_type: z.string().optional(),
  target_id: z.string().optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(10),
});

type TasksQueryOptions = {
  pool?: Pool;
};

export async function registerTasksQueryRoutes(app: FastifyInstance, opts: TasksQueryOptions) {
  app.get("/v1/tasks", async (request, reply) => {
    if (!opts.pool) {
      reply.code(500).send({ error: "server not configured" });
      return;
    }
    const parsed = QuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid query" });
      return;
    }
    const { status, action, target_type, target_id, q, page, page_size } = parsed.data;
    const filters: string[] = [];
    const values: Array<string | number> = [];
    if (status) {
      values.push(status);
      filters.push(`t.status = $${values.length}`);
    }
    if (action) {
      values.push(action);
      filters.push(`t.action = $${values.length}`);
    }
    if (target_type) {
      values.push(target_type);
      filters.push(`t.target_type = $${values.length}`);
    }
    if (target_id) {
      values.push(target_id);
      filters.push(`t.target_id = $${values.length}`);
    }
    if (q) {
      values.push(`%${q.toLowerCase()}%`);
      const index = values.length;
      filters.push(
        `(lower(coalesce(t.task_name, '')) like $${index} or lower(t.action) like $${index} or lower(coalesce(i.display_name, '')) like $${index} or lower(coalesce(i.name, '')) like $${index})`,
      );
    }
    const whereClause = filters.length ? `where ${filters.join(" and ")}` : "";
    const fromClause =
      "from tasks t left join instances i on t.target_type = 'instance' and i.id::text = t.target_id";
    const countRes = await opts.pool.query(
      `select count(*)::int as total ${fromClause} ${whereClause}`,
      values,
    );
    values.push(page_size);
    values.push((page - 1) * page_size);
    const res = await opts.pool.query(
      `select t.id, t.target_type, t.target_id, t.task_name, t.action, t.status, t.attempts, t.updated_at, i.name as instance_name, i.display_name as instance_display_name ${fromClause} ${whereClause} order by t.created_at desc, t.id desc limit $${values.length - 1} offset $${values.length}`,
      values,
    );
    reply.send({
      items: res.rows,
      total: countRes.rows[0]?.total ?? 0,
      page,
      page_size,
    });
  });

  app.get("/v1/tasks/:id", async (request, reply) => {
    if (!opts.pool) {
      reply.code(500).send({ error: "server not configured" });
      return;
    }
    const { id } = request.params as { id: string };
    const res = await opts.pool.query("select * from tasks where id = $1", [id]);
    if (!res.rowCount) {
      reply.code(404).send({ error: "not found" });
      return;
    }
    reply.send(res.rows[0]);
  });

  app.get("/v1/tasks/:id/attempts", async (request, reply) => {
    if (!opts.pool) {
      reply.code(500).send({ error: "server not configured" });
      return;
    }
    const { id } = request.params as { id: string };
    const res = await opts.pool.query(
      "select attempt, status, error, started_at, finished_at from task_attempts where task_id = $1 order by attempt asc",
      [id],
    );
    reply.send({ items: res.rows });
  });
}
