# API (v0.1)

Base URL: `http://<host>:<port>`

## Auth Model (v0.1)

- **Enrollment secret**: `POST /v1/enroll` uses `enrollment_token` to mint a **device token**.
- **Device token**: sidecar endpoints require `Authorization: Bearer <device_token>`.
- **Admin/UI endpoints**: in v0.1 most read/write endpoints are **not authenticated** (single-tenant MVP). Protect the service at the network layer.

---

## Health

### GET /health

Response:
```json
{ "ok": true }
```

---

## Enrollment (Sidecar Bootstrap)

### POST /v1/enroll

Request:
```json
{
  "enrollment_token": "<shared secret>",
  "instance_name": "i-1"
}
```

Response:
```json
{
  "ok": true,
  "instance_id": "<uuid>",
  "device_token": "<token>"
}
```

---

## Heartbeat (Sidecar)

### POST /v1/heartbeat

Headers:
```
Authorization: Bearer <device_token>
```

Response:
```json
{ "ok": true }
```

Notes:
- Control plane stores heartbeat in Redis key `hb:<instanceId>` with TTL `90s` (fact: `online`).

---

## Tasks (Sidecar Pull/Ack)

### POST /v1/tasks/pull

Headers:
```
Authorization: Bearer <device_token>
```

Request:
```json
{ "limit": 5 }
```

Response:
```json
{
  "tasks": [
    {
      "id": "<uuid>",
      "action": "skills.update",
      "payload": {},
      "target_type": "instance",
      "target_id": "<instance-id>"
    }
  ]
}
```

Notes:
- Leases are recorded in Redis (`SET NX PX`) before moving a task to `status='leased'` in Postgres.
- Control plane also stores `lease_expires_at` in Postgres and will reclaim expired leases on next pull.
- Lease TTL is action-dependent (probe shorter, skill bundle install longer).

### POST /v1/tasks/ack

Headers:
```
Authorization: Bearer <device_token>
```

Request:
```json
{
  "task_id": "<uuid>",
  "status": "ok",
  "error": "<optional>",
  "result": "<optional>"
}
```

Response (ok):
```json
{ "ok": true }
```

Response (error):
```json
{ "ok": true, "status": "pending" }
```

Notes:
- `attempts` is incremented on **lease**; `ack` records `task_attempts` but does not bump `attempts` again.
- On `status="error"`, control plane may return `status="pending"` (will retry) or `status="failed"` (no more retries).
- `skills.status` is treated as a probe and fails closed (`status="failed"`) on error.
- Probe-related actions update instance facts:
  - `fleet.gateway.probe` writes `gateway_reachable`, `openclaw_version`
  - `skills.status` writes `skills_snapshot`
- Any successful skill-changing action invalidates `skills_snapshot` (forces next `skills.status` probe writeback).

---

## Instances

### GET /v1/instances

Response:
```json
{
  "items": [
    {
      "id": "<uuid>",
      "name": "i-1",
      "updated_at": "<timestamptz>",
      "control_ui_url": "<optional url>",
      "skills_snapshot_at": "<optional timestamptz>",
      "online": true
    }
  ]
}
```

### GET /v1/instances/:id

Response: instance row (includes `skills_snapshot` and `skills_snapshot_at`).

### PATCH /v1/instances/:id

Request:
```json
{
  "name": "<optional>",
  "control_ui_url": "<optional url>"
}
```

### GET /v1/instances/:id/skills

Response:
```json
{
  "skills": "<skills snapshot object>",
  "updated_at": "<optional timestamptz>"
}
```

---

## Labels (Business Labels)

Rules:
- `openclaw.io/*` are **system labels** (read-only in v0.1).
- Business labels must use `biz.openclaw.io/*` prefix and comply with K8s label syntax.

### GET /v1/instances/:id/labels

Response:
```json
{
  "items": [
    { "key": "biz.openclaw.io/env", "value": "prod", "source": "business", "updated_at": "<timestamptz>" }
  ]
}
```

### POST /v1/instances/:id/labels

Request:
```json
{ "key": "biz.openclaw.io/env", "value": "prod" }
```

Response:
```json
{ "ok": true }
```

### DELETE /v1/instances/:id/labels?key=<encoded-label-key>

Primary form for proxy-safe deletion of business labels whose key contains `/`.

Example:
```
DELETE /v1/instances/<id>/labels?key=biz.openclaw.io%2Fenv
```

Backward compatibility:
- `DELETE /v1/instances/:id/labels/:key` is still accepted in v0.1.

Response:
```json
{ "ok": true }
```

---

## Groups (Named Selectors)

Group is a **named label selector** (not a static membership list).

### GET /v1/groups

Response:
```json
{ "items": [ { "id": "<uuid>", "name": "g1", "selector": "<selector>", "description": null } ] }
```

### POST /v1/groups

Request:
```json
{ "name": "g1", "selector": "biz.openclaw.io/env=prod", "description": "optional" }
```

### GET /v1/groups/:id

### PATCH /v1/groups/:id

### DELETE /v1/groups/:id

### GET /v1/groups/:id/matches

Response:
```json
{ "items": [ { "id": "<instance-id>", "name": "i-1" } ] }
```

---

## Campaigns (Batch Fan-out Execution)

Campaign is the v0.1 batch execution object:
- selector-scoped, dynamic membership
- fan-out per instance per generation
- gate/probe/facts aware

### GET /v1/campaigns

Response:
```json
{
  "items": [
    {
      "id": "<uuid>",
      "name": "c1",
      "selector": "<selector>",
      "action": "skills.status",
      "generation": 1,
      "status": "open",
      "created_at": "<timestamptz>",
      "updated_at": "<timestamptz>",
      "closed_at": null,
      "expires_at": null
    }
  ]
}
```

### POST /v1/campaigns

Request:
```json
{
  "name": "c1",
  "selector": "biz.openclaw.io/env=prod",
  "action": "skills.status",
  "payload": {},
  "gate": { "minVersion": "0000.0.0" },
  "rollout": {},
  "expires_at": "2026-12-31T00:00:00.000Z"
}
```

Response: campaign row.

### GET /v1/campaigns/:id

Response: campaign row.

### PATCH /v1/campaigns/:id

Notes:
- `generation` increments only when `action` or `payload` changes (selector/gate/rollout changes do not bump generation).

### POST /v1/campaigns/:id/close

Response:
```json
{ "id": "<uuid>", "status": "closed", "closed_at": "<timestamptz>" }
```

---

## Events (L2 Audit Timeline) + Export

### GET /v1/events

Query:
- `campaign_id` (optional)
- `instance_id` (optional)
- `event_type` (optional)
- `limit` (optional, 1..500, default 200)

Response:
```json
{
  "items": [
    {
      "id": "<uuid>",
      "event_type": "exec.finished",
      "ts": "<timestamptz>",
      "campaign_id": "<optional uuid>",
      "campaign_generation": 1,
      "instance_id": "<optional uuid>",
      "instance_name": "<optional>",
      "labels_snapshot": { "biz.openclaw.io/env": "prod" },
      "facts_snapshot": null,
      "payload": {
        "task_id": "<uuid>",
        "action": "agent.run",
        "payload": {
          "message": "rese[sha256:...]"
        }
      },
      "artifact_id": "<optional uuid>"
    }
  ]
}
```

### GET /v1/events/export

Query: same as `/v1/events`, plus:
- `format`: `jsonl` (default) or `csv`

Response:
- `jsonl`: one JSON object per line
- `csv`: header + rows

---

## Artifacts (Raw Payload/Results)

Artifacts store raw payload/result/error for debugging (events are redacted by default).

### GET /v1/artifacts/:id

Response: artifact row `{ id, kind, created_at, expires_at, content, sha256, bytes }`.

---

## Skill Bundles (tar.gz)

### GET /v1/skill-bundles

Response:
```json
{ "items": [ { "id": "<uuid>", "name": "my-skill", "format": "tar.gz", "sha256": "<hex>", "size_bytes": 123 } ] }
```

### POST /v1/skill-bundles

Request:
```json
{
  "name": "my-skill",
  "format": "tar.gz",
  "content_base64": "<base64-encoded tar.gz bytes>"
}
```

Response: bundle metadata row (id/name/sha256/size_bytes/created_at).

### GET /v1/skill-bundles/:id

Response: bundle metadata.

### GET /v1/skill-bundles/:id/download

Response: binary `tar.gz` bytes (`content-type: application/gzip`) with `Content-Disposition: attachment; filename="<bundle-name>.tar.gz"`.

### DELETE /v1/skill-bundles/:id

Response:
```json
{ "ok": true }
```

---

## Tasks (Admin)

These endpoints are used by UI and operational tooling.

### POST /v1/tasks

Request:
```json
{
  "target_type": "instance",
  "target_id": "<instance-id>",
  "action": "skills.update",
  "payload": {},
  "expires_at": "2026-12-31T00:00:00.000Z"
}
```

Response:
```json
{ "ok": true, "id": "<uuid>" }
```

Notes:
- Direct task creation immediately emits an `exec.queued` event with a redacted payload summary and a raw `task.payload` artifact.
- `target_type="group"` still exists for backward compatibility and uses the legacy `group_instances` membership mapping.
- In v0.1, **Groups are named selectors**, not memberships. Prefer **Campaigns** for batch execution.

### GET /v1/tasks

Query (all optional):
- `status`
- `action`
- `target_type`
- `target_id`

Response:
```json
{ "items": [ { "id": "<uuid>", "target_type": "instance", "target_id": "<id>", "action": "skills.update", "status": "pending", "attempts": 1 } ] }
```

### GET /v1/tasks/:id

Response: task row (all columns).

### GET /v1/tasks/:id/attempts

Response:
```json
{ "items": [ { "attempt": 1, "status": "ok", "error": null, "started_at": "<timestamptz>", "finished_at": "<optional timestamptz>" } ] }
```
