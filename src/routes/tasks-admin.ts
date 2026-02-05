import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";

const TaskSchema = z.object({
  target_type: z.enum(["instance", "group"]),
  target_id: z.string().min(1),
  action: z.string().min(1),
  payload: z.record(z.unknown()).optional(),
  expires_at: z.string().datetime().optional(),
});

type TasksAdminOptions = {
  pool?: Pool;
};

export async function registerTasksAdminRoutes(app: FastifyInstance, opts: TasksAdminOptions) {
  app.post("/v1/tasks", async (request, reply) => {
    if (!opts.pool) {
      reply.code(500).send({ error: "server not configured" });
      return;
    }
    const parsed = TaskSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid payload" });
      return;
    }

    const payload = parsed.data.payload ?? {};
    const res = await opts.pool.query(
      "insert into tasks (target_type, target_id, action, payload, expires_at) values ($1, $2, $3, $4, $5) returning id",
      [
        parsed.data.target_type,
        parsed.data.target_id,
        parsed.data.action,
        payload,
        parsed.data.expires_at ?? null,
      ],
    );
    reply.send({ ok: true, id: res.rows[0].id });
  });
}
