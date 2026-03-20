import type { Pool } from "pg";
import { insertEvent } from "../events/store.js";

export type ProbeKind = "gateway" | "skills";

function probeAction(kind: ProbeKind) {
  return kind === "gateway" ? "fleet.gateway.probe" : "skills.status";
}

export async function ensureProbeTaskScheduled(
  pool: Pool,
  instanceId: string,
  kind: ProbeKind,
  now = new Date(),
): Promise<void> {
  const state = await pool.query(
    "select next_allowed_at from instance_probe_states where instance_id = $1 and probe_kind = $2",
    [instanceId, kind],
  );
  if (state.rowCount) {
    const nextAllowedAt = state.rows[0].next_allowed_at as unknown;
    if (nextAllowedAt) {
      const d = nextAllowedAt instanceof Date ? nextAllowedAt : new Date(String(nextAllowedAt));
      if (Number.isFinite(d.getTime()) && d.getTime() > now.getTime()) {
        return;
      }
    }
  }

  const action = probeAction(kind);
  const existing = await pool.query(
    "select id from tasks where target_type = 'instance' and target_id = $1 and action = $2 and status in ('pending','leased') limit 1",
    [instanceId, action],
  );
  if (existing.rowCount) {
    return;
  }

  const task = await pool.query(
    "insert into tasks (target_type, target_id, action, payload, task_origin) values ('instance',$1,$2,$3,'system') returning id",
    [instanceId, action, {}],
  );
  const taskId = String(task.rows[0].id);

  const facts = await pool.query(
    "select gateway_reachable, gateway_reachable_at, openclaw_version, openclaw_version_at, skills_snapshot_at, skills_snapshot_invalidated_at from instances where id = $1",
    [instanceId],
  );
  const factsSnapshot =
    facts.rowCount === 0
      ? null
      : {
          gateway_reachable:
            facts.rows[0].gateway_reachable === null ? null : Boolean(facts.rows[0].gateway_reachable),
          gateway_reachable_at: (facts.rows[0].gateway_reachable_at ?? null) as Date | null,
          openclaw_version: (facts.rows[0].openclaw_version ?? null) as string | null,
          openclaw_version_at: (facts.rows[0].openclaw_version_at ?? null) as Date | null,
          skills_snapshot_at: (facts.rows[0].skills_snapshot_at ?? null) as Date | null,
          skills_snapshot_invalidated_at: (facts.rows[0].skills_snapshot_invalidated_at ?? null) as Date | null,
        };

  await insertEvent(pool, {
    event_type: "probe.requested",
    ts: now,
    instance_id: instanceId,
    facts_snapshot: factsSnapshot ?? undefined,
    payload: { probe_kind: kind, task_id: taskId, action },
  });
}
