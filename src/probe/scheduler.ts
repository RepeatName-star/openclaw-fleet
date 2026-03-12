import type { Pool } from "pg";

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

  await pool.query(
    "insert into tasks (target_type, target_id, action, payload) values ('instance',$1,$2,$3)",
    [instanceId, action, {}],
  );
}

