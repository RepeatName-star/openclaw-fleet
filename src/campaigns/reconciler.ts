import type { Pool } from "pg";
import { redactValue } from "../events/redact.js";
import { insertArtifact, insertEvent } from "../events/store.js";
import { evaluateGate } from "../gate/evaluate.js";
import { matchLabelSelector, parseLabelSelector } from "../labels/label-selector.js";
import { ensureProbeTaskScheduled } from "../probe/scheduler.js";

type InstanceWithLabels = {
  id: string;
  name: string;
  labels: Record<string, string>;
  gateway_reachable: boolean | null;
  gateway_reachable_at: Date | null;
  openclaw_version: string | null;
  openclaw_version_at: Date | null;
  skills_snapshot_at: Date | null;
  skills_snapshot_invalidated_at: Date | null;
};

type ReconcilerDeps = {
  getOnline?: (instanceId: string) => Promise<boolean>;
};

const DEFAULT_EVENT_SENSITIVE_PATHS = [
  ["payload", "message"],
  ["payload", "raw"],
];

export async function reconcileOpenCampaignsOnce(pool: Pool, deps: ReconcilerDeps = {}): Promise<void> {
  const campaignsRes = await pool.query(
    "select id, selector, action, payload, gate, generation, expires_at from campaigns where status = 'open' order by created_at asc",
  );
  const nowMs = Date.now();
  const campaigns = campaignsRes.rows.filter((row: any) => {
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

  const getOnline = deps.getOnline ?? (async () => true);

  const instancesRes = await pool.query(
    "select id, name, gateway_reachable, gateway_reachable_at, openclaw_version, openclaw_version_at, skills_snapshot_at, skills_snapshot_invalidated_at from instances order by created_at asc",
  );
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

  const instances: InstanceWithLabels[] = instancesRes.rows.map((row: any) => ({
    id: String(row.id),
    name: String(row.name),
    labels: labelsByInstanceId.get(String(row.id)) ?? {},
    gateway_reachable: row.gateway_reachable === null ? null : Boolean(row.gateway_reachable),
    gateway_reachable_at: (row.gateway_reachable_at ?? null) as Date | null,
    openclaw_version: (row.openclaw_version ?? null) as string | null,
    openclaw_version_at: (row.openclaw_version_at ?? null) as Date | null,
    skills_snapshot_at: (row.skills_snapshot_at ?? null) as Date | null,
    skills_snapshot_invalidated_at: (row.skills_snapshot_invalidated_at ?? null) as Date | null,
  }));
  const instancesById = new Map(instances.map((inst) => [inst.id, inst]));
  const onlineById = new Map<string, boolean>();
  for (const inst of instances) {
    onlineById.set(inst.id, await getOnline(inst.id));
  }

  for (const campaign of campaigns) {
    const campaignId = String(campaign.id);
    const selectorStr = String(campaign.selector ?? "");
    const action = String(campaign.action);
    const payload = (campaign.payload ?? {}) as Record<string, unknown>;
    const gate = (campaign.gate ?? {}) as Record<string, unknown>;
    const generation = Number(campaign.generation);
    const now = new Date();
    const minVersionRaw = (gate as any)?.minVersion;
    const minVersion = typeof minVersionRaw === "string" && minVersionRaw.length > 0 ? minVersionRaw : "0000.0.0";

    const parsed = parseLabelSelector(selectorStr);
    if (!parsed.selector) {
      // v0.1: ignore invalid selector; Milestone 4 will surface this as an event.
      continue;
    }

    const matching = instances.filter((inst) => matchLabelSelector(parsed.selector, inst.labels));
    const matchingIds = new Set(matching.map((m) => m.id));

    // Ensure a campaign_instances row exists for each matching instance.
    for (const inst of matching) {
      const inserted = await pool.query(
        "insert into campaign_instances (campaign_id, generation, instance_id, state) values ($1,$2,$3,'pending') on conflict do nothing returning instance_id",
        [campaignId, generation, inst.id],
      );
      if (inserted.rowCount) {
        await insertEvent(pool, {
          event_type: "target.added",
          campaign_id: campaignId,
          campaign_generation: generation,
          instance_id: inst.id,
          payload: { action },
        });
      }
    }

    // Mark removed when an existing target is no longer in selector scope.
    const existing = await pool.query(
      "select instance_id from campaign_instances where campaign_id = $1 and generation = $2 and state in ('pending','blocked','queued')",
      [campaignId, generation],
    );
    for (const row of existing.rows) {
      const instanceId = String(row.instance_id);
      if (!matchingIds.has(instanceId)) {
        const updated = await pool.query(
          "update campaign_instances set state = 'removed', updated_at = now(), last_transition_at = now() where campaign_id = $1 and generation = $2 and instance_id = $3 and state in ('pending','blocked','queued')",
          [campaignId, generation, instanceId],
        );
        if (updated.rowCount) {
          await insertEvent(pool, {
            event_type: "target.removed",
            campaign_id: campaignId,
            campaign_generation: generation,
            instance_id: instanceId,
            payload: {},
          });
        }
      }
    }

    // Gate: check and block (no repair). Schedule probes for stale/missing facts.
    const candidates = await pool.query(
      "select instance_id, state, blocked_reason from campaign_instances where campaign_id = $1 and generation = $2 and state in ('pending','blocked')",
      [campaignId, generation],
    );
    for (const row of candidates.rows) {
      const instanceId = String(row.instance_id);
      const state = String(row.state);
      const blockedReason = row.blocked_reason === null ? null : String(row.blocked_reason);
      const inst = instancesById.get(instanceId);
      if (!inst) {
        continue;
      }
      const online = onlineById.get(instanceId) ?? false;

      const evaluated = evaluateGate(
        {
          action,
          online,
          gateway_reachable: inst.gateway_reachable,
          gateway_reachable_at: inst.gateway_reachable_at,
          openclaw_version: inst.openclaw_version,
          openclaw_version_at: inst.openclaw_version_at,
          skills_snapshot_at: inst.skills_snapshot_at,
          skills_snapshot_invalidated_at: inst.skills_snapshot_invalidated_at,
        },
        { minVersion },
        now,
      );

      if (!evaluated.ok) {
        const shouldEmitBlocked =
          state !== "blocked" ||
          (blockedReason ?? "") !== (evaluated.blocked_reason ?? "");
        if (shouldEmitBlocked) {
          await pool.query(
            "update campaign_instances set state = 'blocked', blocked_reason = $4, updated_at = now(), last_transition_at = now() where campaign_id = $1 and generation = $2 and instance_id = $3",
            [campaignId, generation, instanceId, evaluated.blocked_reason],
          );
          await insertEvent(pool, {
            event_type: "target.blocked",
            campaign_id: campaignId,
            campaign_generation: generation,
            instance_id: instanceId,
            facts_snapshot: {
              online,
              gateway_reachable: inst.gateway_reachable,
              gateway_reachable_at: inst.gateway_reachable_at,
              openclaw_version: inst.openclaw_version,
              openclaw_version_at: inst.openclaw_version_at,
              skills_snapshot_at: inst.skills_snapshot_at,
              skills_snapshot_invalidated_at: inst.skills_snapshot_invalidated_at,
            },
            payload: { blocked_reason: evaluated.blocked_reason },
          });
        }
        for (const kind of evaluated.needs_probes) {
          await ensureProbeTaskScheduled(pool, instanceId, kind, now);
        }
        continue;
      }

      if (state === "blocked") {
        await pool.query(
          "update campaign_instances set state = 'pending', blocked_reason = null, updated_at = now(), last_transition_at = now() where campaign_id = $1 and generation = $2 and instance_id = $3",
          [campaignId, generation, instanceId],
        );
        await insertEvent(pool, {
          event_type: "target.unblocked",
          campaign_id: campaignId,
          campaign_generation: generation,
          instance_id: instanceId,
          payload: {},
        });
      }
    }

    const pending = await pool.query(
      "select instance_id from campaign_instances where campaign_id = $1 and generation = $2 and state = 'pending' and task_id is null order by created_at asc",
      [campaignId, generation],
    );
    for (const row of pending.rows) {
      const instanceId = String(row.instance_id);
      const task = await pool.query(
        "insert into tasks (target_type, target_id, action, payload, task_origin) values ('instance',$1,$2,$3,'campaign') returning id",
        [instanceId, action, payload],
      );
      const taskId = String(task.rows[0].id);
      const artifact = await insertArtifact(pool, {
        kind: "task.payload",
        content: {
          task_id: taskId,
          target_type: "instance",
          target_id: instanceId,
          action,
          payload,
        },
      });
      const redacted = redactValue(
        { action, payload },
        { mode: "event", sensitivePaths: DEFAULT_EVENT_SENSITIVE_PATHS },
      ) as Record<string, unknown>;
      await pool.query(
        "update campaign_instances set state = 'queued', task_id = $4, updated_at = now(), last_transition_at = now() where campaign_id = $1 and generation = $2 and instance_id = $3",
        [campaignId, generation, instanceId, taskId],
      );
      await insertEvent(pool, {
        event_type: "exec.queued",
        campaign_id: campaignId,
        campaign_generation: generation,
        instance_id: instanceId,
        artifact_id: artifact.id,
        payload: { task_id: taskId, ...redacted },
      });
    }
  }
}
