import { evaluateGate } from "../../src/gate/evaluate.js";

test("evaluateGate blocks when gateway fact missing", () => {
  const now = new Date("2026-03-11T00:00:00Z");
  const res = evaluateGate(
    {
      action: "skills.status",
      online: true,
      gateway_reachable: null,
      gateway_reachable_at: null,
      openclaw_version: null,
      openclaw_version_at: null,
      skills_snapshot_at: now,
      skills_snapshot_invalidated_at: null,
    },
    { minVersion: "2026.2.26" },
    now,
  );
  expect(res.ok).toBe(false);
  expect(res.blocked_reason).toMatch(/gateway_reachable/i);
});

test("evaluateGate blocks when skills snapshot invalidated", () => {
  const now = new Date("2026-03-11T00:00:00Z");
  const res = evaluateGate(
    {
      action: "fleet.skill_bundle.install",
      online: true,
      gateway_reachable: true,
      gateway_reachable_at: now,
      openclaw_version: "2026.2.26",
      openclaw_version_at: now,
      skills_snapshot_at: now,
      skills_snapshot_invalidated_at: new Date("2026-03-11T00:00:01Z"),
    },
    { minVersion: "2026.2.26" },
    now,
  );
  expect(res.ok).toBe(false);
  expect(res.blocked_reason).toMatch(/skills_snapshot/i);
});

test("evaluateGate allows unparseable version when no explicit minVersion is configured", () => {
  const now = new Date("2026-03-11T00:00:00Z");
  const res = evaluateGate(
    {
      action: "agent.run",
      online: true,
      gateway_reachable: true,
      gateway_reachable_at: now,
      openclaw_version: "dev",
      openclaw_version_at: now,
      skills_snapshot_at: now,
      skills_snapshot_invalidated_at: null,
    },
    { minVersion: "0000.0.0" },
    now,
  );
  expect(res.ok).toBe(true);
});

test("evaluateGate allows agent.run without skills snapshot", () => {
  const now = new Date("2026-03-11T00:00:00Z");
  const res = evaluateGate(
    {
      action: "agent.run",
      online: true,
      gateway_reachable: true,
      gateway_reachable_at: now,
      openclaw_version: null,
      openclaw_version_at: null,
      skills_snapshot_at: null,
      skills_snapshot_invalidated_at: null,
    },
    { minVersion: "0000.0.0" },
    now,
  );
  expect(res.ok).toBe(true);
});

test("evaluateGate allows session.reset without skills snapshot", () => {
  const now = new Date("2026-03-11T00:00:00Z");
  const res = evaluateGate(
    {
      action: "session.reset",
      online: true,
      gateway_reachable: true,
      gateway_reachable_at: now,
      openclaw_version: null,
      openclaw_version_at: null,
      skills_snapshot_at: null,
      skills_snapshot_invalidated_at: null,
    },
    { minVersion: "0000.0.0" },
    now,
  );
  expect(res.ok).toBe(true);
});

test("evaluateGate allows fleet.config_patch without skills snapshot", () => {
  const now = new Date("2026-03-11T00:00:00Z");
  const res = evaluateGate(
    {
      action: "fleet.config_patch",
      online: true,
      gateway_reachable: true,
      gateway_reachable_at: now,
      openclaw_version: null,
      openclaw_version_at: null,
      skills_snapshot_at: null,
      skills_snapshot_invalidated_at: null,
    },
    { minVersion: "0000.0.0" },
    now,
  );
  expect(res.ok).toBe(true);
});

test("evaluateGate allows fleet.gateway.probe without prior gateway or version facts", () => {
  const now = new Date("2026-03-11T00:00:00Z");
  const res = evaluateGate(
    {
      action: "fleet.gateway.probe",
      online: true,
      gateway_reachable: null,
      gateway_reachable_at: null,
      openclaw_version: null,
      openclaw_version_at: null,
      skills_snapshot_at: null,
      skills_snapshot_invalidated_at: null,
    },
    { minVersion: "2026.2.26" },
    now,
  );
  expect(res.ok).toBe(true);
});

test("evaluateGate still blocks on minVersion when explicitly configured", () => {
  const now = new Date("2026-03-11T00:00:00Z");
  const res = evaluateGate(
    {
      action: "agent.run",
      online: true,
      gateway_reachable: true,
      gateway_reachable_at: now,
      openclaw_version: "2026.2.25",
      openclaw_version_at: now,
      skills_snapshot_at: null,
      skills_snapshot_invalidated_at: null,
    },
    { minVersion: "2026.2.26" },
    now,
  );
  expect(res.ok).toBe(false);
  expect(res.blocked_reason).toMatch(/minVersion/i);
});
