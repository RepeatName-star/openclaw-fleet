import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";

const QuerySchema = z.object({
  status: z.string().optional(),
  action: z.string().optional(),
  target_type: z.string().optional(),
  target_id: z.string().optional(),
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
    const { status, action, target_type, target_id } = parsed.data;
    const filters: string[] = [];
    const values: Array<string> = [];
    if (status) {
      values.push(status);
      filters.push(`status = $${values.length}`);
    }
    if (action) {
      values.push(action);
      filters.push(`action = $${values.length}`);
    }
    if (target_type) {
      values.push(target_type);
      filters.push(`target_type = $${values.length}`);
    }
    if (target_id) {
      values.push(target_id);
      filters.push(`target_id = $${values.length}`);
    }
    const whereClause = filters.length ? `where ${filters.join(" and ")}` : "";
    const res = await opts.pool.query(
      `select id, target_type, target_id, action, status, attempts, updated_at from tasks ${whereClause} order by created_at desc limit 200`,
      values,
    );
    reply.send({ items: res.rows });
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
