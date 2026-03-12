import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { requireDeviceToken } from "../auth.js";

const AckSchema = z.object({
  task_id: z.string().min(1),
  status: z.enum(["ok", "error"]),
  error: z.string().optional(),
  result: z.unknown().optional(),
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
      "select id, attempts, action, target_type, target_id from tasks where id = $1",
      [taskId],
    );
    if (!taskRes.rowCount) {
      reply.code(404).send({ error: "task not found" });
      return;
    }
    const currentAttempts = Number(taskRes.rows[0].attempts ?? 0);
    const taskAction = taskRes.rows[0].action as string;
    const taskTargetType = taskRes.rows[0].target_type as string;
    const taskTargetId = taskRes.rows[0].target_id as string;

    if (parsed.data.status === "ok") {
      await opts.pool.query(
        "update tasks set status = 'done', result = $2, updated_at = now() where id = $1",
        [taskId, parsed.data.result ?? null],
      );
      await opts.pool.query(
        "insert into task_attempts (task_id, attempt, status) values ($1, $2, $3)",
        [taskId, currentAttempts, "ok"],
      );
      if (taskTargetType === "instance" && taskAction === "fleet.gateway.probe") {
        const gatewayReachable = Boolean((parsed.data.result as any)?.gateway_reachable);
        const versionRaw = (parsed.data.result as any)?.openclaw_version;
        const version = typeof versionRaw === "string" && versionRaw.length > 0 ? versionRaw : null;
        await opts.pool.query(
          "update instances set gateway_reachable = $2, gateway_reachable_at = now(), openclaw_version = coalesce($3, openclaw_version), openclaw_version_at = case when $3 is null then openclaw_version_at else now() end where id = $1",
          [taskTargetId, gatewayReachable, version],
        );
      }
      if (taskTargetType === "instance" && (taskAction === "skills.install" || taskAction === "skills.update")) {
        await opts.pool.query(
          "update instances set skills_snapshot_invalidated_at = now() where id = $1",
          [taskTargetId],
        );
      }
      if (taskAction === "skills.status" && taskTargetType === "instance") {
        await opts.pool.query(
          "update instances set skills_snapshot = $2, skills_snapshot_at = now(), skills_snapshot_invalidated_at = null where id = $1",
          [taskTargetId, parsed.data.result ?? {}],
        );
      }
      reply.send({ ok: true });
      return;
    }

    const nextAttempts = currentAttempts + 1;
    const nextStatus =
      taskAction === "skills.status" ? "failed" : nextAttempts >= MAX_ATTEMPTS ? "failed" : "pending";
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
