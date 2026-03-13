# Bulk Management v0.1 Implementation Plan

This plan implements the v0.1 contract defined in:
- `docs/bulk-management.md` (semantics)
- `docs/v0.1-scope.md` (feature checklist + boundaries)

## Decisions (Locked)

- Control plane is single-tenant in v0.1 (RBAC/multi-tenant deferred).
- Batch execution is modeled as `Campaign` fan-out (not group queue semantics).
- Selector matches labels only (K8s label selector semantics); gate uses facts.
- Audit is L2 structured events; export JSONL primary, CSV secondary; 90-day retention.
- Raw payload/results needed for analysis go into a separate Artifact store:
  - Enabled by default
  - 30-day rolling retention
  - Postgres backend (v0.1)
  - No explicit size limits enforced in v0.1
- Remote skill distribution:
  - Sidecar downloads bundles only via control plane-issued URLs
  - Bundle format: `tar.gz`
  - Storage backend: Postgres (v0.1)
  - Installs to `~/.openclaw-fleet/skills`
  - Sidecar patches OpenClaw config to load `skills.load.extraDirs += ~/.openclaw-fleet/skills`
- Probe behavior:
  - Execution freezes when gateway is unreachable; probes continue with exponential backoff + Full Jitter (cap 5 minutes).
- Version gating:
  - Compare supports CalVer (`YYYY.M.D`, e.g. `2026.2.26`) and SemVer.
  - Unparseable versions fail closed (blocked) with probe event containing raw value.

## Milestones (Recommended Order)

### Milestone 0: Schema First (DB + Migrations + Tests)

**Goal:** add new tables while keeping current MVP task pipeline operational.

Detailed plan: `docs/plans/2026-03-11-v0.1-m0-schema.md`.

Deliverables:
- Postgres migrations + pg-mem tests for:
  - Business labels and system labels storage (per instance)
  - Selectors (named groups)
  - Campaigns + per-instance campaign state (idempotency by `(campaign_id, generation, instance_id)`)
  - Events (append-only) with retention hooks
  - Artifacts store (30-day retention) with event references by `artifact_id`
  - Skill bundles storage (tar.gz) + metadata (`sha256`, `size`, `created_at`)

Notes:
- Keep existing `tasks` table as the execution queue (instance-targeted tasks and probes).
- Avoid breaking `/v1/tasks/pull` and `/v1/tasks/ack` while introducing new v0.1 APIs.

### Milestone 1: Labels + Selector APIs

**Goal:** label-driven ownership and dynamic scoping.

Detailed plan: `docs/plans/2026-03-11-v0.1-m1-labels-selectors.md`.

Deliverables:
- Instance label CRUD:
  - Business labels writeable.
  - `openclaw.io/*` system labels read-only; conflicts rejected.
- Selector CRUD:
  - `Group = named selector` using K8s label selector syntax.
  - Preview endpoint: selector -> matching instance IDs (for UI/CLI).

### Milestone 2: Campaign API + Reconciler (Fan-out)

**Goal:** create a `Campaign`, continuously reconcile membership, and schedule per-instance executions.

Detailed plan: `docs/plans/2026-03-11-v0.1-m2-campaigns-reconciler.md`.

Deliverables:
- Campaign CRUD with:
  - `open/closed` + optional TTL auto-close
  - `generation` increments only when `action/payload` changes
- Reconcile loop:
  - Follows selector membership while campaign is `open`
  - For each in-scope instance, ensure a single execution per `(campaign_id, generation)`
  - Best-effort scheduling: eligible runs first; blocked remain blocked; auto-catch-up when unblocked
  - Restart-safe: control plane restart triggers re-reconcile for open campaigns

Execution queue strategy (v0.1):
- Create instance-targeted rows in existing `tasks` table for actual execution.
- Task results/attempts are still written via `/v1/tasks/ack`.

### Milestone 3: Gate/Facts/Probe v0.1 (4 facts)

**Goal:** make scheduling correctness deterministic and explainable.

Detailed plan: `docs/plans/2026-03-11-v0.1-m3-gate-facts-probe.md`.

Deliverables:
- Facts:
  - `online` from heartbeat
  - `skills_snapshot` from `skills.status` result writes
  - `gateway_reachable` and `version` from a dedicated probe task (sidecar connects to gateway and reports hello-ok.server.version)
- Gate:
  - Block if facts missing/stale/failed
  - No repair actions inside gate
- Probe:
  - Control plane triggers probes on-demand
  - Exponential backoff + Full Jitter, cap 5 minutes
- `skills_snapshot` staleness rule:
  - Any successful `skills.install`/`skills.update` marks snapshot stale immediately
  - Must wait for `skills.status` probe writeback before unblocking skill-dependent work

### Milestone 4: Events L2 + Artifacts (Default On)

**Goal:** execution feedback and auditable history without leaking secrets into exports.

Detailed plan: `docs/plans/2026-03-11-v0.1-m4-events-artifacts.md`.

Deliverables:
- Event emitters for minimum v0.1 set:
  - `target.added/removed/blocked/unblocked`
  - `exec.queued/started/finished`
  - `probe.requested/finished/failed`
- Export:
  - JSONL primary, CSV secondary
  - 90-day rolling deletion (events), 30-day rolling deletion (artifacts)
- Redaction:
  - Sensitive strings stored as `prefix(4)+sha256` in events
  - Raw payload/results stored in artifacts, events reference `artifact_id`

### Milestone 5: Remote Skill Bundle Distribution (tar.gz)

**Goal:** distribute skill folders without relying on gateway internals.

Detailed plan: `docs/plans/2026-03-11-v0.1-m5-skill-bundles.md`.

Deliverables:
- Control plane:
  - Upload/register `tar.gz` bundle into Postgres, compute `sha256`
  - Issue short-lived download URL for sidecars (authenticated; may later redirect to CDN/object storage)
- Sidecar action (name TBD, should be namespaced, e.g. `fleet.skill_bundle.install`):
  - Download bundle via control plane URL
  - Verify `sha256`
  - Extract into `~/.openclaw-fleet/skills/<skillName>` (best-effort atomic swap if feasible)
  - Ensure OpenClaw loads extra dir:
    - `config.get` to obtain `baseHash`
    - `config.patch` merge patch to add `skills.load.extraDirs += ~/.openclaw-fleet/skills`
  - Trigger `skills.status` probe to refresh snapshot
- Events + artifacts:
  - Installation timeline is visible and auditable; raw output stored as artifacts.

### Milestone 6: CLI (UI/Control Separation)

**Goal:** provide a stable control surface without coupling to UI.

Detailed plan: `docs/plans/2026-03-11-v0.1-m6-cli.md`.

Deliverables:
- CLI commands for:
  - labels/selectors
  - campaigns (create/close/status/follow)
  - events export
  - artifacts fetch
  - bundles upload/install

## Acceptance Criteria (v0.1)

- You can define labels and selectors, and observe dynamic membership changes.
- You can create a campaign against a selector and see:
  - per-instance queued/running/finished state
  - blocked reasons with probe events
  - auto-catch-up when an instance becomes eligible
- You can run `skills.install/update` in bulk and the system never treats skills snapshot as fresh until `skills.status` writes back.
- You can export events (JSONL/CSV) safely (no secrets), yet still retrieve raw payload/results via artifacts for analysis (30 days).
- You can upload a `tar.gz` skill bundle, distribute it to instances, patch OpenClaw config to load the extra dir, and observe refreshed skills snapshot.

## Deferred (Explicit)

- Artifact signing / trust policy
- Platform compatibility precheck (`os/arch` + metadata)
- RBAC / multi-tenant
- Instance provisioning / full OpenClaw lifecycle CRUD from control plane
