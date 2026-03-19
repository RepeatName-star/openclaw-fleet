import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { requireDeviceToken } from "../auth.js";
import { redactValue } from "../events/redact.js";
import { insertArtifact, insertEvent } from "../events/store.js";
import { computeNextAllowedAtMs } from "../probe/backoff.js";

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
const PROBE_BACKOFF_BASE_MS = 1000;
const PROBE_BACKOFF_CAP_MS = 5 * 60_000;

function isProbeAction(action: string) {
  return action === "fleet.gateway.probe" || action === "skills.status";
}

function isInteractiveFileAction(action: string) {
  return action === "agents.files.list" || action === "agents.files.get" || action === "agents.files.set";
}

function normalizeAgentRunPayloads(input: unknown) {
  if (!Array.isArray(input)) {
    return undefined;
  }
  return input
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    .map((item) => ({
      text: typeof item.text === "string" ? item.text : null,
      mediaUrl: typeof item.mediaUrl === "string" ? item.mediaUrl : null,
    }));
}

function normalizeAgentRunResult(result: unknown) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return result;
  }
  const record = result as Record<string, unknown>;
  const nested =
    record.result && typeof record.result === "object" && !Array.isArray(record.result)
      ? (record.result as Record<string, unknown>)
      : null;
  const payloads = normalizeAgentRunPayloads(nested?.payloads);
  if (!payloads) {
    return result;
  }
  return {
    runId: record.runId,
    status: record.status,
    summary: record.summary,
    result: { payloads },
  };
}

function normalizeTaskResult(action: string, result: unknown) {
  if (action === "agent.run") {
    return normalizeAgentRunResult(result);
  }
  return result;
}

async function resetProbeState(pool: Pool, instanceId: string, probeKind: string) {
  await pool.query(
    "insert into instance_probe_states (instance_id, probe_kind, consecutive_failures, next_allowed_at, updated_at) values ($1,$2,0,null,now()) on conflict (instance_id, probe_kind) do update set consecutive_failures = 0, next_allowed_at = null, updated_at = now()",
    [instanceId, probeKind],
  );
}

async function bumpProbeFailure(pool: Pool, instanceId: string, probeKind: string, now = new Date()) {
  const current = await pool.query(
    "select consecutive_failures from instance_probe_states where instance_id = $1 and probe_kind = $2",
    [instanceId, probeKind],
  );
  const failures = current.rowCount ? Number(current.rows[0].consecutive_failures ?? 0) : 0;
  const nextAllowedAtMs = computeNextAllowedAtMs({
    nowMs: now.getTime(),
    consecutiveFailures: failures,
    baseMs: PROBE_BACKOFF_BASE_MS,
    capMs: PROBE_BACKOFF_CAP_MS,
  });
  const nextFailures = failures + 1;
  const nextAllowedAt = new Date(nextAllowedAtMs);
  await pool.query(
    "insert into instance_probe_states (instance_id, probe_kind, consecutive_failures, next_allowed_at, updated_at) values ($1,$2,$3,$4,now()) on conflict (instance_id, probe_kind) do update set consecutive_failures = excluded.consecutive_failures, next_allowed_at = excluded.next_allowed_at, updated_at = now()",
    [instanceId, probeKind, nextFailures, nextAllowedAt],
  );
}

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
    const executingInstanceId = request.device.instanceId;
    const normalizedResult = normalizeTaskResult(taskAction, parsed.data.result ?? null);

    if (parsed.data.status === "ok") {
      await opts.pool.query(
        "update tasks set status = 'done', result = $2, updated_at = now() where id = $1",
        [taskId, normalizedResult],
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
        if (gatewayReachable) {
          await resetProbeState(opts.pool, taskTargetId, "gateway");
        } else {
          await bumpProbeFailure(opts.pool, taskTargetId, "gateway");
        }
      }
      if (
        taskTargetType === "instance" &&
        (taskAction === "skills.install" ||
          taskAction === "skills.update" ||
          taskAction === "fleet.skill_bundle.install")
      ) {
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
        await resetProbeState(opts.pool, taskTargetId, "skills");
      }

      const linked = await opts.pool.query(
        "select campaign_id, generation from campaign_instances where task_id = $1 limit 1",
        [taskId],
      );
      const campaignId = linked.rowCount ? String(linked.rows[0].campaign_id) : null;
      const campaignGen = linked.rowCount ? Number(linked.rows[0].generation) : null;
      const eventType = campaignId
        ? "exec.finished"
        : isProbeAction(taskAction)
          ? "probe.finished"
          : "exec.finished";
      const artifact = await insertArtifact(opts.pool, {
        kind: "task.result",
        content: { task_id: taskId, action: taskAction, status: "ok", result: normalizedResult },
      });
      await insertEvent(opts.pool, {
        event_type: eventType,
        campaign_id: campaignId,
        campaign_generation: campaignGen,
        instance_id: executingInstanceId,
        artifact_id: artifact.id,
        payload: {
          task_id: taskId,
          action: taskAction,
          status: "ok",
        },
      });
      reply.send({ ok: true });
      return;
    }

    const nextStatus =
      taskAction === "skills.status"
        ? "failed"
        : isInteractiveFileAction(taskAction)
          ? "failed"
        : currentAttempts >= MAX_ATTEMPTS
          ? "failed"
          : "pending";
    await opts.pool.query(
      "update tasks set status = $2, updated_at = now() where id = $1",
      [taskId, nextStatus],
    );
    await opts.pool.query(
      "insert into task_attempts (task_id, attempt, status, error) values ($1, $2, $3, $4)",
      [taskId, currentAttempts, "error", parsed.data.error ?? null],
    );

    if (taskTargetType === "instance" && taskAction === "skills.status") {
      await bumpProbeFailure(opts.pool, taskTargetId, "skills");
    }

    const linked = await opts.pool.query(
      "select campaign_id, generation from campaign_instances where task_id = $1 limit 1",
      [taskId],
    );
    const campaignId = linked.rowCount ? String(linked.rows[0].campaign_id) : null;
    const campaignGen = linked.rowCount ? Number(linked.rows[0].generation) : null;
    const eventType = campaignId
      ? "exec.finished"
      : isProbeAction(taskAction)
        ? "probe.finished"
        : "exec.finished";
    const raw = {
      task_id: taskId,
      action: taskAction,
      status: "error",
      error: parsed.data.error ?? null,
      result: normalizedResult,
    };
    const artifact = await insertArtifact(opts.pool, { kind: "task.error", content: raw });
    const errorRedacted =
      typeof parsed.data.error === "string"
        ? (redactValue(parsed.data.error, { mode: "sensitive" }) as string)
        : null;
    await insertEvent(opts.pool, {
      event_type: eventType,
      campaign_id: campaignId,
      campaign_generation: campaignGen,
      instance_id: executingInstanceId,
      artifact_id: artifact.id,
      payload: {
        task_id: taskId,
        action: taskAction,
        status: "error",
        task_status: nextStatus,
        error: errorRedacted,
      },
    });
    reply.send({ ok: true, status: nextStatus });
  });
}
