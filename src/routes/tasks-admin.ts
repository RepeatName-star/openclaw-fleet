import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { redactValue } from "../events/redact.js";
import { insertArtifact, insertEvent } from "../events/store.js";

const TaskSchema = z.object({
  target_type: z.enum(["instance", "group"]),
  target_id: z.string().min(1),
  task_name: z.string().min(1).optional(),
  action: z.string().min(1),
  payload: z.record(z.unknown()).optional(),
  expires_at: z.string().datetime().optional(),
});

type TasksAdminOptions = {
  pool?: Pool;
};

const TASK_EVENT_SENSITIVE_PATHS = [
  ["payload", "message"],
  ["payload", "raw"],
];

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
    if (parsed.data.target_type !== "instance") {
      reply.code(400).send({ error: "target_type group is no longer supported; use campaigns" });
      return;
    }

    const payload = parsed.data.payload ?? {};
    const res = await opts.pool.query(
      "insert into tasks (target_type, target_id, task_name, action, payload, expires_at, task_origin) values ($1, $2, $3, $4, $5, $6, 'manual') returning id",
      [
        parsed.data.target_type,
        parsed.data.target_id,
        parsed.data.task_name ?? null,
        parsed.data.action,
        payload,
        parsed.data.expires_at ?? null,
      ],
    );
    const taskId = String(res.rows[0].id);
    const artifact = await insertArtifact(opts.pool, {
      kind: "task.payload",
      content: {
        task_id: taskId,
        target_type: parsed.data.target_type,
        target_id: parsed.data.target_id,
        task_name: parsed.data.task_name ?? null,
        action: parsed.data.action,
        payload,
      },
    });
    const redacted = redactValue(
      {
        task_name: parsed.data.task_name ?? null,
        action: parsed.data.action,
        payload,
      },
      { mode: "event", sensitivePaths: TASK_EVENT_SENSITIVE_PATHS },
    ) as Record<string, unknown>;
    await insertEvent(opts.pool, {
      event_type: "exec.queued",
      task_id: taskId,
      instance_id: parsed.data.target_type === "instance" ? parsed.data.target_id : null,
      artifact_id: artifact.id,
      payload: {
        task_id: taskId,
        ...redacted,
      },
    });
    reply.send({ ok: true, id: taskId });
  });
}
