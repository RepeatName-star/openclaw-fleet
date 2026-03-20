import type { Pool } from "pg";

export async function insertArtifact(
  pool: Pool,
  params: { kind: string; content: unknown; sha256?: string; bytes?: number },
): Promise<{ id: string }> {
  const res = await pool.query(
    "insert into artifacts (kind, content, sha256, bytes) values ($1,$2,$3,$4) returning id",
    [params.kind, params.content ?? {}, params.sha256 ?? null, params.bytes ?? null],
  );
  return { id: String(res.rows[0].id) };
}

export async function insertEvent(
  pool: Pool,
  params: {
    event_type: string;
    ts?: Date;
    task_id?: string | null;
    campaign_id?: string | null;
    campaign_generation?: number | null;
    instance_id?: string | null;
    payload?: unknown;
    facts_snapshot?: unknown;
    artifact_id?: string | null;
  },
): Promise<void> {
  let instanceName: string | null = null;
  let labelsSnapshot: Record<string, string> = {};

  if (params.instance_id) {
    const inst = await pool.query("select name from instances where id = $1", [params.instance_id]);
    instanceName = inst.rowCount ? String(inst.rows[0].name) : null;

    const labels = await pool.query(
      "select key, value from instance_labels where instance_id = $1 order by key asc",
      [params.instance_id],
    );
    labelsSnapshot = {};
    for (const row of labels.rows) {
      labelsSnapshot[String(row.key)] = String(row.value ?? "");
    }
  }

  await pool.query(
    "insert into events (event_type, ts, task_id, campaign_id, campaign_generation, instance_id, instance_name, labels_snapshot, facts_snapshot, payload, artifact_id) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
    [
      params.event_type,
      params.ts ?? new Date(),
      params.task_id ?? null,
      params.campaign_id ?? null,
      params.campaign_generation ?? null,
      params.instance_id ?? null,
      instanceName,
      labelsSnapshot,
      params.facts_snapshot ?? null,
      params.payload ?? {},
      params.artifact_id ?? null,
    ],
  );
}
