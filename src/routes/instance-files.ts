import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { FLEET_MANAGED_FILE_NAMES, isFleetManagedFileName } from "../files/allowlist.js";

const FileQuerySchema = z.object({
  agent_id: z.string().min(1).optional(),
});

const PutFileSchema = z.object({
  agent_id: z.string().min(1).optional(),
  content: z.string(),
});

type InstanceFilesRoutesOptions = {
  pool?: Pool;
};

const DEFAULT_AGENT_ID = "main";
const FILE_TASK_TIMEOUT_MS = 5000;
const FILE_TASK_POLL_INTERVAL_MS = 20;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeFileMeta(file: Record<string, unknown>, fallbackName?: string) {
  const item: Record<string, unknown> = {
    name: typeof file.name === "string" ? file.name : fallbackName ?? "",
    missing: Boolean(file.missing),
  };
  if (typeof file.size === "number") {
    item.size = file.size;
  }
  if (typeof file.updatedAtMs === "number") {
    item.updated_at_ms = file.updatedAtMs;
  }
  if (typeof file.content === "string") {
    item.content = file.content;
  }
  return item;
}

async function ensureInstanceExists(pool: Pool, instanceId: string) {
  const res = await pool.query("select id from instances where id = $1", [instanceId]);
  return res.rowCount > 0;
}

async function enqueueTask(
  pool: Pool,
  params: {
    instanceId: string;
    action: string;
    payload: Record<string, unknown>;
    taskName: string;
    taskOrigin?: "system" | "campaign" | "manual";
  },
) {
  const res = await pool.query(
    "insert into tasks (target_type, target_id, task_name, action, payload, task_origin) values ('instance', $1, $2, $3, $4, $5) returning id",
    [params.instanceId, params.taskName, params.action, params.payload, params.taskOrigin ?? "system"],
  );
  return String(res.rows[0].id);
}

async function waitForTaskResult(pool: Pool, taskId: string) {
  const deadline = Date.now() + FILE_TASK_TIMEOUT_MS;
  while (Date.now() <= deadline) {
    const task = await pool.query("select status, result from tasks where id = $1", [taskId]);
    if (!task.rowCount) {
      throw new Error("task not found");
    }
    const status = String(task.rows[0].status);
    if (status === "done") {
      return task.rows[0].result as Record<string, unknown>;
    }
    if (status === "failed") {
      const attempt = await pool.query(
        "select error from task_attempts where task_id = $1 order by started_at desc limit 1",
        [taskId],
      );
      throw new Error(String(attempt.rows[0]?.error ?? "task failed"));
    }
    await sleep(FILE_TASK_POLL_INTERVAL_MS);
  }
  throw new Error("task timed out");
}

export async function registerInstanceFilesRoutes(
  app: FastifyInstance,
  opts: InstanceFilesRoutesOptions,
) {
  app.get("/v1/instances/:id/files", async (request, reply) => {
    if (!opts.pool) {
      reply.code(500).send({ error: "server not configured" });
      return;
    }
    const query = FileQuerySchema.safeParse(request.query ?? {});
    if (!query.success) {
      reply.code(400).send({ error: "invalid query" });
      return;
    }
    const { id } = request.params as { id: string };
    if (!(await ensureInstanceExists(opts.pool, id))) {
      reply.code(404).send({ error: "not found" });
      return;
    }
    const agentId = query.data.agent_id ?? DEFAULT_AGENT_ID;
    const taskId = await enqueueTask(opts.pool, {
      instanceId: id,
      taskName: "list managed files",
      action: "agents.files.list",
      payload: { agentId },
      taskOrigin: "system",
    });

    try {
      const result = await waitForTaskResult(opts.pool, taskId);
      const rawFiles = Array.isArray(result.files) ? result.files : [];
      const byName = new Map<string, Record<string, unknown>>();
      for (const file of rawFiles) {
        if (file && typeof file === "object" && typeof (file as any).name === "string") {
          byName.set((file as any).name, file as Record<string, unknown>);
        }
      }
      const items = FLEET_MANAGED_FILE_NAMES.map((name) =>
        sanitizeFileMeta(byName.get(name) ?? { name, missing: true }, name),
      );
      reply.send({ items });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      reply.code(message === "task timed out" ? 504 : 502).send({ error: message });
    }
  });

  app.get("/v1/instances/:id/files/:name", async (request, reply) => {
    if (!opts.pool) {
      reply.code(500).send({ error: "server not configured" });
      return;
    }
    const query = FileQuerySchema.safeParse(request.query ?? {});
    if (!query.success) {
      reply.code(400).send({ error: "invalid query" });
      return;
    }
    const { id, name } = request.params as { id: string; name: string };
    if (!isFleetManagedFileName(name)) {
      reply.code(404).send({ error: "not found" });
      return;
    }
    if (!(await ensureInstanceExists(opts.pool, id))) {
      reply.code(404).send({ error: "not found" });
      return;
    }
    const agentId = query.data.agent_id ?? DEFAULT_AGENT_ID;
    const taskId = await enqueueTask(opts.pool, {
      instanceId: id,
      taskName: `read file ${name}`,
      action: "agents.files.get",
      payload: { agentId, name },
      taskOrigin: "system",
    });

    try {
      const result = await waitForTaskResult(opts.pool, taskId);
      const file =
        result.file && typeof result.file === "object"
          ? (result.file as Record<string, unknown>)
          : { name, missing: true };
      reply.send(sanitizeFileMeta(file, name));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      reply.code(message === "task timed out" ? 504 : 502).send({ error: message });
    }
  });

  app.put("/v1/instances/:id/files/:name", async (request, reply) => {
    if (!opts.pool) {
      reply.code(500).send({ error: "server not configured" });
      return;
    }
    const parsed = PutFileSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid payload" });
      return;
    }
    const { id, name } = request.params as { id: string; name: string };
    if (!isFleetManagedFileName(name)) {
      reply.code(404).send({ error: "not found" });
      return;
    }
    if (!(await ensureInstanceExists(opts.pool, id))) {
      reply.code(404).send({ error: "not found" });
      return;
    }
    const agentId = parsed.data.agent_id ?? DEFAULT_AGENT_ID;
    const taskId = await enqueueTask(opts.pool, {
      instanceId: id,
      taskName: `write file ${name}`,
      action: "agents.files.set",
      payload: { agentId, name, content: parsed.data.content },
      taskOrigin: "system",
    });

    try {
      const result = await waitForTaskResult(opts.pool, taskId);
      const file =
        result.file && typeof result.file === "object"
          ? (result.file as Record<string, unknown>)
          : { name, missing: false, content: parsed.data.content };
      reply.send({
        ok: true,
        file: sanitizeFileMeta(file, name),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      reply.code(message === "task timed out" ? 504 : 502).send({ error: message });
    }
  });
}
