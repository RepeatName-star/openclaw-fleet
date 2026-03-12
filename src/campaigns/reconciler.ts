import type { Pool } from "pg";
import { matchLabelSelector, parseLabelSelector } from "../labels/label-selector.js";

type InstanceWithLabels = {
  id: string;
  name: string;
  labels: Record<string, string>;
};

export async function reconcileOpenCampaignsOnce(pool: Pool): Promise<void> {
  const campaignsRes = await pool.query(
    "select id, selector, action, payload, generation, expires_at from campaigns where status = 'open' order by created_at asc",
  );
  const nowMs = Date.now();
  const campaigns = campaignsRes.rows.filter((row) => {
    const expiresAt = row.expires_at as unknown;
    if (expiresAt === null || expiresAt === undefined) {
      return true;
    }
    const d = expiresAt instanceof Date ? expiresAt : new Date(String(expiresAt));
    return Number.isFinite(d.getTime()) && d.getTime() > nowMs;
  });

  if (campaigns.length === 0) {
    return;
  }

  const instancesRes = await pool.query("select id, name from instances order by created_at asc");
  const labelsRes = await pool.query(
    "select instance_id, key, value from instance_labels order by key asc",
  );

  const labelsByInstanceId = new Map<string, Record<string, string>>();
  for (const row of labelsRes.rows) {
    const instanceId = String(row.instance_id);
    const key = String(row.key);
    const value = String(row.value ?? "");
    const labels = labelsByInstanceId.get(instanceId) ?? {};
    labels[key] = value;
    labelsByInstanceId.set(instanceId, labels);
  }

  const instances: InstanceWithLabels[] = instancesRes.rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    labels: labelsByInstanceId.get(String(row.id)) ?? {},
  }));

  for (const campaign of campaigns) {
    const campaignId = String(campaign.id);
    const selectorStr = String(campaign.selector ?? "");
    const action = String(campaign.action);
    const payload = (campaign.payload ?? {}) as Record<string, unknown>;
    const generation = Number(campaign.generation);

    const parsed = parseLabelSelector(selectorStr);
    if (parsed.error) {
      // v0.1: ignore invalid selector; Milestone 4 will surface this as an event.
      continue;
    }

    const matching = instances.filter((inst) => matchLabelSelector(parsed.selector, inst.labels));
    const matchingIds = new Set(matching.map((m) => m.id));

    // Ensure a campaign_instances row exists for each matching instance.
    for (const inst of matching) {
      await pool.query(
        "insert into campaign_instances (campaign_id, generation, instance_id, state) values ($1,$2,$3,'pending') on conflict do nothing",
        [campaignId, generation, inst.id],
      );
    }

    // Mark removed when an existing target is no longer in selector scope.
    const existing = await pool.query(
      "select instance_id from campaign_instances where campaign_id = $1 and generation = $2 and state in ('pending','blocked','queued')",
      [campaignId, generation],
    );
    for (const row of existing.rows) {
      const instanceId = String(row.instance_id);
      if (!matchingIds.has(instanceId)) {
        await pool.query(
          "update campaign_instances set state = 'removed', updated_at = now(), last_transition_at = now() where campaign_id = $1 and generation = $2 and instance_id = $3 and state in ('pending','blocked','queued')",
          [campaignId, generation, instanceId],
        );
      }
    }

    // Gate is stubbed as "always pass" in Milestone 2: schedule tasks for all pending.
    const pending = await pool.query(
      "select instance_id from campaign_instances where campaign_id = $1 and generation = $2 and state = 'pending' and task_id is null order by created_at asc",
      [campaignId, generation],
    );
    for (const row of pending.rows) {
      const instanceId = String(row.instance_id);
      const task = await pool.query(
        "insert into tasks (target_type, target_id, action, payload) values ('instance',$1,$2,$3) returning id",
        [instanceId, action, payload],
      );
      await pool.query(
        "update campaign_instances set state = 'queued', task_id = $4, updated_at = now(), last_transition_at = now() where campaign_id = $1 and generation = $2 and instance_id = $3",
        [campaignId, generation, instanceId, task.rows[0].id],
      );
    }
  }
}
