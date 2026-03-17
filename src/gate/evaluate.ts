import { compareVersions } from "../version/compare.js";

export type ProbeKind = "gateway" | "skills";

export type GateInputs = {
  action: string;
  online: boolean;
  gateway_reachable: boolean | null;
  gateway_reachable_at: Date | null;
  openclaw_version: string | null;
  openclaw_version_at: Date | null;
  skills_snapshot_at: Date | null;
  skills_snapshot_invalidated_at: Date | null;
};

export type GateConfig = {
  minVersion: string;
};

export type GateOk = { ok: true };
export type GateBlocked = {
  ok: false;
  blocked_reason: string;
  needs_probes: ProbeKind[];
};

const TTL_GATEWAY_REACHABLE_MS = 30_000;
const TTL_VERSION_MS = 24 * 60 * 60_000;
const TTL_SKILLS_SNAPSHOT_MS = 10 * 60_000;
const NO_MIN_VERSION = "0000.0.0";
const ACTIONS_REQUIRING_SKILLS_SNAPSHOT = new Set([
  "skills.install",
  "skills.update",
  "fleet.skill_bundle.install",
]);

function isFresh(at: Date | null, ttlMs: number, now: Date) {
  if (!at) return false;
  const ageMs = now.getTime() - at.getTime();
  return ageMs >= 0 && ageMs <= ttlMs;
}

function isGatewayProbeAction(action: string) {
  return action === "fleet.gateway.probe";
}

function requiresGatewayFact(action: string) {
  return !isGatewayProbeAction(action);
}

function requiresSkillsSnapshot(action: string) {
  return ACTIONS_REQUIRING_SKILLS_SNAPSHOT.has(action);
}

export function evaluateGate(inputs: GateInputs, config: GateConfig, now = new Date()): GateOk | GateBlocked {
  if (!inputs.online) {
    return { ok: false, blocked_reason: "online fact missing/stale", needs_probes: [] };
  }

  if (requiresGatewayFact(inputs.action)) {
    if (inputs.gateway_reachable !== true) {
      return {
        ok: false,
        blocked_reason: "gateway_reachable missing/false",
        needs_probes: ["gateway"],
      };
    }
    if (!isFresh(inputs.gateway_reachable_at, TTL_GATEWAY_REACHABLE_MS, now)) {
      return {
        ok: false,
        blocked_reason: "gateway_reachable stale",
        needs_probes: ["gateway"],
      };
    }
  }

  if (config.minVersion !== NO_MIN_VERSION && !isGatewayProbeAction(inputs.action)) {
    if (!inputs.openclaw_version || !isFresh(inputs.openclaw_version_at, TTL_VERSION_MS, now)) {
      return { ok: false, blocked_reason: "openclaw_version missing/stale", needs_probes: ["gateway"] };
    }
    try {
      if (compareVersions(inputs.openclaw_version, config.minVersion) < 0) {
        return { ok: false, blocked_reason: "openclaw_version below minVersion", needs_probes: ["gateway"] };
      }
    } catch {
      return { ok: false, blocked_reason: "openclaw_version unparseable", needs_probes: ["gateway"] };
    }
  }

  if (requiresSkillsSnapshot(inputs.action)) {
    if (!inputs.skills_snapshot_at) {
      return { ok: false, blocked_reason: "skills_snapshot missing", needs_probes: ["skills"] };
    }
    if (!isFresh(inputs.skills_snapshot_at, TTL_SKILLS_SNAPSHOT_MS, now)) {
      return { ok: false, blocked_reason: "skills_snapshot stale", needs_probes: ["skills"] };
    }

    if (
      inputs.skills_snapshot_invalidated_at &&
      inputs.skills_snapshot_invalidated_at.getTime() > inputs.skills_snapshot_at.getTime()
    ) {
      return { ok: false, blocked_reason: "skills_snapshot invalidated", needs_probes: ["skills"] };
    }
  }

  return { ok: true };
}
