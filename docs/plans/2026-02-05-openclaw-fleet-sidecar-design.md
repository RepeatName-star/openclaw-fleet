# OpenClaw Fleet Sidecar Design

Date: 2026-02-05
Status: Draft (approved in chat)

## Summary
Build a Node.js/TypeScript sidecar (npm package) that runs on Linux + Windows, polls the control plane for tasks, and executes them against a local provider (OpenClaw Gateway or a generic HTTP-compatible agent). It uses JSON file state for idempotency and device token storage. Default poll interval is 5s and concurrency is configurable (default 2). Enrollment uses a shared enrollment token to obtain a device token.

## Goals
- Compatible with OpenClaw Gateway without modifying OpenClaw core.
- Generic HTTP provider support for similar agents.
- At-least-once task delivery with local idempotency.
- Simple deployment via npm package; config file + env overrides.
- V1 actions: config patch/apply, skills install/update, memory replace, session refresh.

## Non-Goals (V1)
- Arbitrary script execution.
- WebSocket control plane connection (polling only).
- Multi-tenant RBAC.

## Architecture
Modules:
- **Config Loader**: reads JSON config and overlays env vars.
- **State Store (JSON)**: persists device token, executed task IDs, last sync time.
- **Control Plane Client**: heartbeat + task pull + ack over HTTP.
- **Provider Adapter**: OpenClaw Provider + Generic HTTP Provider.
- **Task Executor**: maps actions to provider calls; enforces ordering.
- **Scheduler**: fixed-interval polling, concurrency limit.

## Provider Adapters
### OpenClaw Provider
- Talks to local Gateway API (127.0.0.1).
- Uses configured token; optional fallback to `~/.openclaw/openclaw.json` when provider=openclaw and no token provided.
- Maps actions per API mapping doc:
  - `config.patch|apply`
  - `skills.install|update`
  - `agents.files.set` for memory/persona
  - `sessions.reset`
  - `agent` (optional trigger)

### Generic HTTP Provider
- Defines a minimal action interface for similar agents.
- Exposes endpoints like `/config`, `/skills`, `/memory`, `/sessions`.

## Data Flow
1) Sidecar starts, loads config, validates required fields.
2) Enrollment: if no device token, call `/v1/enroll` with enrollment token.
3) Heartbeat loop: `POST /v1/heartbeat` every interval.
4) Task loop: `POST /v1/tasks/pull`, process tasks with concurrency limit.
5) Idempotency check: skip tasks already recorded as done.
6) Execute via Provider; on success, write state + `POST /v1/tasks/ack`.
7) On failure, report error; control plane decides retry.

## Idempotency
- State store tracks `task_id` + outcome.
- Atomic JSON writes (temp file + rename).
- Sidecar does not retry tasks locally to avoid duplication.

## Error Handling
- Standard error shape: `code`, `message`, `retryable`.
- Gateway unreachable/auth errors marked retryable.
- Validation errors are non-retryable.

## Testing
- Unit: config merge, state store, action mapping.
- Integration: mock control plane + mock provider.
- Manual: real OpenClaw instance for skills/memory/session changes.

