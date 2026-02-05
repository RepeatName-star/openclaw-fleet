import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { requireDeviceToken } from "../auth.js";

const AckSchema = z.object({
  task_id: z.string().min(1),
  status: z.enum(["ok", "error"]),
  error: z.string().optional(),
});

type TasksAckOptions = {
  pool?: Pool;
};

const MAX_ATTEMPTS = 5;

export async function registerTasksAckRoutes(app: FastifyInstance, opts: TasksAckOptions) {
  app.post("/v1/tasks/ack", async (request, reply) => {
    if (!opts.pool) {
      reply.code(500).send({ error: "server not configured" });
      return;
    }
    await requireDeviceToken(opts.pool, request, reply);
    if (!request.device) {
      return;
    }

    const parsed = AckSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid payload" });
      return;
    }

    const taskId = parsed.data.task_id;
    const taskRes = await opts.pool.query(
      "select id, attempts from tasks where id = $1",
      [taskId],
    );
    if (!taskRes.rowCount) {
      reply.code(404).send({ error: "task not found" });
      return;
    }
    const currentAttempts = Number(taskRes.rows[0].attempts ?? 0);

    if (parsed.data.status === "ok") {
      await opts.pool.query(
        "update tasks set status = 'done', updated_at = now() where id = $1",
        [taskId],
      );
      await opts.pool.query(
        "insert into task_attempts (task_id, attempt, status) values ($1, $2, $3)",
        [taskId, currentAttempts, "ok"],
      );
      reply.send({ ok: true });
      return;
    }

    const nextAttempts = currentAttempts + 1;
    const nextStatus = nextAttempts >= MAX_ATTEMPTS ? "failed" : "pending";
    await opts.pool.query(
      "update tasks set status = $2, attempts = $3, updated_at = now() where id = $1",
      [taskId, nextStatus, nextAttempts],
    );
    await opts.pool.query(
      "insert into task_attempts (task_id, attempt, status, error) values ($1, $2, $3, $4)",
      [taskId, nextAttempts, "error", parsed.data.error ?? null],
    );
    reply.send({ ok: true, status: nextStatus });
  });
}
