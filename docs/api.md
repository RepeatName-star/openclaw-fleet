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

Query:
- `q` matches `display_name` first, then hostname `name`
- `page` defaults to `1`
- `page_size` defaults to `10`

Response:
```json
{
  "items": [
    {
      "id": "<uuid>",
      "name": "i-1",
      "display_name": "beijing-master",
      "last_seen_ip": "10.0.0.8",
      "updated_at": "<timestamptz>",
      "control_ui_url": "<optional url>",
      "skills_snapshot_at": "<optional timestamptz>",
      "online": true
    }
  ],
  "total": 1,
  "page": 1,
  "page_size": 10
}
```

### GET /v1/instances/:id

Response: instance row (includes `display_name`, `last_seen_ip`, `skills_snapshot`, and `skills_snapshot_at`).

### PATCH /v1/instances/:id

Request:
```json
{
  "name": "<optional>",
  "display_name": "<optional>",
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
- `POST /v1/instances/:id/labels/delete` with JSON body `{ "key": "biz.openclaw.io/env" }` is the browser-safe alias used by the UI.

Response:
```json
{ "ok": true }
```

---

## Groups (Named Selectors)

Group is a **named label selector** (not a static membership list).

### GET /v1/groups

Query:
- `q` matches group `name`
- `page` defaults to `1`
- `page_size` defaults to `10`

Response:
```json
{
  "items": [
    { "id": "<uuid>", "name": "g1", "selector": "<selector>", "description": null }
  ],
  "total": 1,
  "page": 1,
  "page_size": 10
}
```

### POST /v1/groups

Request:
```json
{ "name": "g1", "selector": "biz.openclaw.io/env=prod", "description": "optional" }
```

### GET /v1/groups/:id

### PATCH /v1/groups/:id

### DELETE /v1/groups/:id

### POST /v1/groups/:id/delete

Browser-safe alias for group deletion.

Response:
```json
{ "ok": true }
```

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

Query:
- `include_deleted=true|1` to include soft-deleted campaigns in the list. Default is to hide them.
- `q` matches campaign `name`
- `page` defaults to `1`
- `page_size` defaults to `10`

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
  ],
  "total": 1,
  "page": 1,
  "page_size": 10
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

Notes:
- `selector` must be a valid K8s-style label selector expression.
- Prefix fragments such as `biz.openclaw.io/` are rejected with `400 {"error":"invalid selector"}`.

Response: campaign row.

### GET /v1/campaigns/:id

Response: campaign row.

### PATCH /v1/campaigns/:id

Notes:
- If `selector` is present, it must still be a valid K8s-style label selector expression.
- Prefix fragments such as `biz.openclaw.io/` are rejected with `400 {"error":"invalid selector"}`.
- `generation` increments only when `action` or `payload` changes (selector/gate/rollout changes do not bump generation).
- `gate.minVersion` is the only server-read gate field in v0.1.1.
- `rollout` is persisted for forward compatibility but is not enforced by the current reconciler.
- Gate is action-aware in v0.1.1:
  - `online` is always required
  - `gateway_reachable` is required for gateway-bound actions except `fleet.gateway.probe`
  - `openclaw_version` is checked only when `gate.minVersion` is explicitly set to a non-zero value
  - `skills_snapshot` currently blocks only skill-mutating campaign actions (`skills.install`, `skills.update`, `fleet.skill_bundle.install`)

### POST /v1/campaigns/:id/close

Response:
```json
{ "id": "<uuid>", "status": "closed", "closed_at": "<timestamptz>" }
```

### DELETE /v1/campaigns/:id

Delete a closed campaign only.

Response:
```json
{ "ok": true }
```

Notes:
- Open campaigns return `409`.
- Deleted campaigns are hidden from `GET /v1/campaigns` and `GET /v1/campaigns/:id`.
- Deleting a campaign keeps the underlying campaign id as a tombstone so historical `events?campaign_id=<id>` queries continue to work.
- Historical tasks, events, and artifacts are retained.

### POST /v1/campaigns/:id/delete

Browser-safe alias for campaign deletion.

---

## Events (L2 Audit Timeline) + Export

### GET /v1/events

Query:
- `campaign_id` (optional)
- `instance_id` (optional)
- `event_type` (optional)
- `limit` (optional legacy alias for first-page size)
- `page` defaults to `1`
- `page_size` defaults to `10`

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
  ],
  "total": 1,
  "page": 1,
  "page_size": 10
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

### POST /v1/skill-bundles/:id/delete

Browser-safe alias for skill bundle deletion.

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
  "task_name": "refresh skills inventory",
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
- For `fleet.config_patch`, `payload.raw` is redacted in the event but preserved in the artifact.
- `target_type="group"` is rejected in v0.1.1.
- In v0.1, **Groups are named selectors**, not memberships. Use **Campaigns** for batch execution.
- Recommended config-edit path:
  - `fleet.config_patch` for normal Fleet-driven batch changes
  - raw `config.patch` only when the caller wants to manage `baseHash` manually

### GET /v1/tasks

Query (all optional):
- `q` matches `task_name`, `action`, `instance display_name`, and `instance name`
- `page` defaults to `1`
- `page_size` defaults to `10`
- `status`
- `action`
- `target_type`
- `target_id`

Response:
```json
{
  "items": [
    {
      "id": "<uuid>",
      "target_type": "instance",
      "target_id": "<id>",
      "task_name": "refresh skills inventory",
      "action": "skills.update",
      "status": "pending",
      "attempts": 1,
      "instance_name": "i-abc123",
      "instance_display_name": "beijing-master"
    }
  ],
  "total": 1,
  "page": 1,
  "page_size": 10
}
```

### GET /v1/tasks/:id

Response: task row (all columns).

### GET /v1/tasks/:id/attempts

Response:
```json
{ "items": [ { "attempt": 1, "status": "ok", "error": null, "started_at": "<timestamptz>", "finished_at": "<optional timestamptz>" } ] }
```
