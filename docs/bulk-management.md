# Bulk Management (Selector / Campaign / Policy)

This doc locks down the semantics for OpenClaw Fleet to act as a **business control plane** that can batch-manage OpenClaw instances.

It focuses on the parts that are easy to get wrong early: selector semantics, dynamic membership, idempotency, gating, and auditability.

## Goals

- Batch manage a large number of OpenClaw instances across mixed environments:
  - Kubernetes (containerized)
  - Cloud VMs
  - Potential NAT/edge devices (outbound-only connectivity)
- Provide a consistent abstraction: the control plane treats every target as an `Instance`.
- Provide safe, explainable batch execution:
  - Fan-out to every matching instance (not "any one instance in a group")
  - "Best-effort" execution with continuous reconciliation
  - Fully auditable timeline, exportable

## Non-Goals / Boundaries (v0.x)

- No arbitrary host shell/script execution from the control plane.
  - Operations requiring SSH/shell should be implemented as **OpenClaw skills** and executed via the existing Gateway actions.
- "K8s lifecycle alignment" is allowed as a separate layer, but is **invisible** to the business control plane.
  - The control plane only needs stable `Instance` identity plus metadata/facts for scheduling.
- Multi-tenant and RBAC are deferred to roadmap; v0.x runs as single-tenant.

## Core Concepts

### Instance

An `Instance` is the unit of management (a registered Sidecar + a local OpenClaw Gateway).

Key requirements:
- Stable identity:
  - Control plane stores `instance_id` (UUID) and `instance_name`.
  - In Kubernetes, prefer `StatefulSet` style identity and persist the Sidecar token in `Secret` to survive restarts.
- Capability visibility:
  - Labels and facts are used for selection and gating.

### Labels (Tagging)

Labels are for **ownership and selection scope**, not for readiness gating.

Sources are hybrid:
- System labels (derived by control plane/sidecar/K8s layer)
- Business labels (set by operators/users)

Governance rules:
- System label prefix: `openclaw.io/*`
  - Read-only to users.
  - Highest priority.
- Business label prefix: `biz.openclaw.io/*`
  - Must follow Kubernetes label syntax rules.
  - Writes that attempt to use `openclaw.io/*` are rejected.
  - Conflicts with system labels are rejected (fail fast, no ambiguity).

### Facts (Readiness Data)

Facts are for **gating** (readiness/compatibility) and are time-bound (TTL).

Facts are owned by the system; users do not edit them directly.

v0.1 minimum facts:
- `online` (from heartbeat)
- `gateway_reachable` (probe)
- `version` (probe, e.g. via gateway `server.version`)
- `skills_snapshot` (probe/ack, stored snapshot + timestamp)

Facts are "hybrid": sidecar can push lightweight facts, while the control plane can trigger read-only probes for authoritative refresh.

Recommended TTL defaults (v0.1):
- `online`: 90s
- `gateway_reachable`: 30s
- `version`: 24h
- `skills_snapshot`: 10m (plus event-driven invalidation on skill updates)

Notes:
- `version` is used for compatibility gating only when a campaign explicitly sets `gate.minVersion`.
  - Comparison must support OpenClaw's current CalVer-style format (example: `2026.2.26`) and SemVer.
  - If a version cannot be parsed, the gate should fail closed (treat as blocked) and surface the raw value in a probe-related event.

### Selector (Group)

`Group = named Selector`.

- Selector only matches **labels** (Kubernetes label selector semantics).
- Selector is dynamic:
  - Instances can enter/leave the matching set over time.
- Selector does not include readiness requirements; those live in `Gate`.

### Campaign (Batch Execution)

A `Campaign` is the first-class object for batch task execution.

Properties:
- `selector`: label selector string (scope)
- `action` + `payload`: what to run
- `gate`: checks required before an instance is eligible
- `rollout`: pacing/concurrency controls
  - In v0.1 it is stored but not enforced by the reconciler yet.
- `generation`: increments **only when** `action/payload` changes
- lifecycle:
  - `open` by default
  - manual `close`
  - optional TTL: after expiry, auto-close

Execution model:
- Fan-out per instance:
  - Each matching instance will have at most one execution per `(campaign_id, generation)`.
- Best-effort reconciliation:
  - Eligible instances run immediately.
  - Blocked instances remain blocked and visible as such.
  - When facts become satisfied later, the control plane schedules executions automatically.
  - Reconciliation must be restart-safe: on control plane startup, open campaigns are re-reconciled to avoid "stuck" state after restarts.
- Dynamic membership:
  - While `open`, campaign continuously follows selector membership changes.
  - After `closed`, no new members are scheduled; already-running executions are allowed to finish and report results.

Idempotency (dedupe):
- The system must enforce: one execution per instance per campaign generation.
- If an instance leaves scope and later re-enters, it is not re-executed for the same generation.

### Gate (Preconditions)

Gate is "check and block", not "repair".

- If gate is strict and facts are not satisfied:
  - The instance is `blocked`.
  - Campaign remains reconciling and will schedule when gate passes later.
- Gate never mutates baseline config.
  - Baseline alignment must be handled by `Policy`.

Common v0.1 gate checks (illustrative):
- `online=true` (within TTL)
- `gateway_reachable=true` (within TTL) for gateway-bound actions except `fleet.gateway.probe`
- `version >= minVersion` only when a campaign explicitly sets `gate.minVersion`
- `skills_snapshot` is fresh (not stale) when a campaign depends on skills state
  - v0.1.1 currently treats `skills.install`, `skills.update`, and `fleet.skill_bundle.install` as skills-dependent actions

### Policy (Long-Term Baseline)

Policy is for **continuous configuration alignment** of a selected set of instances.

- Policy uses the same `selector` mechanism to define targets.
- Policy reacts to:
  - Policy spec changes
  - Membership changes
  - Periodic re-check (optional)
- Policy does not interrupt running campaign executions; changes apply when safe.

### Probe

Probe is a read-only action used to refresh facts.

Probe behaviors:
- Automatically triggered by the control plane when gating needs a fresh fact.
- Uses exponential backoff + jitter (Full Jitter), with max interval (recommended default: 5 minutes) to avoid storms during gateway outages.
- When `gateway_reachable=false`, execution scheduling is effectively paused for that instance (blocked by gate); only probes may continue under backoff.

Special rule for `skills_snapshot`:
- It has TTL, and also event-driven invalidation.
- If a skill install/update succeeds, mark `skills_snapshot` as stale immediately.
- While `skills_snapshot` is stale, the instance must be treated as **blocked** for any gate that depends on skills (no "use old snapshot").
- The system must trigger a follow-up `skills.status` probe to refresh the snapshot.
- Gate must wait for that probe writeback before allowing dependent executions (no optimistic pass).

### Event (Audit / Timeline)

Observability is driven by structured, append-only events (L2).

Event requirements:
- Append-only; 90-day rolling retention with export.
- Export:
  - JSONL primary
  - CSV secondary
- Self-contained for offline analysis:
  - Every event redundantly stores `instanceName` and a full snapshot of labels at the time (business + system).
  - Facts snapshots are included only for key events (blocked/probe).
- Redaction:
  - Payload snapshots may be stored, but secrets/tokens must be uniformly redacted (prefer allowlist + hash over raw content when in doubt).
  - v0.1 default: redact sensitive strings as `prefix(4) + sha256`, and never store raw secrets/tokens.
    - Treat these as sensitive by default: `agent.run.message`, `memory.replace.content`, `config.patch.raw`, `skills.update.apiKey`, `skills.update.env.*`, and any `*token*/*secret*/*password*` keys.
  - When operators need raw payload/results for analysis, store them in a separate short-retention "artifact" store (not in the default event export).
    - Events should reference artifacts by ID and keep only redacted previews.
    - v0.1 default:
      - Artifacts are enabled by default with 30-day rolling retention.
      - Storage backend is Postgres (no external object storage required).
      - No explicit size limits are enforced in v0.1 (operators should monitor DB growth).

Minimum event set (v0.1):
- `target.added` / `target.removed`
- `target.blocked` / `target.unblocked`
- `exec.queued` / `exec.started` / `exec.finished`
- `probe.requested` / `probe.finished` / `probe.failed`
