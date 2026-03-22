# Instance Mail Tools Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a minimal instance-scoped mail tool flow to Fleet so operators can list configured mail tools, send/query mail through the control plane, and use the existing `agent.run` task flow for the risk demo.

**Architecture:** Keep the feature entirely in the control plane. Store per-instance mail tool configuration in Postgres, sanitize tool metadata before returning it to the UI, proxy Mailpit HTTP Basic Auth requests from Fastify, and record tool usage as Fleet audit events/artifacts. Do not involve the sidecar or introduce a new Agent management layer.

**Tech Stack:** TypeScript, Fastify, Postgres, React 18, Vitest, Testing Library

### Task 1: Add instance tool storage and listing

**Files:**
- Create: `migrations/008_instance_tools.sql`
- Modify: `src/server.ts`
- Create: `src/routes/instance-tools.ts`
- Create: `tests/instance-tools.test.ts`
- Modify: `tests/db.test.ts`

**Step 1: Write the failing storage and listing tests**

Add coverage for:
- migration creates `instance_tools`
- `GET /v1/instances/:id/tools` returns enabled tools for one instance only
- tool list sanitizes secrets (`password`, raw auth) out of the API response
- unknown instance returns `404`

**Step 2: Run the focused tests and verify they fail**

Run:
```bash
pnpm exec vitest run tests/db.test.ts tests/instance-tools.test.ts
```

Expected: FAIL because the table and route do not exist.

**Step 3: Implement the minimal schema and read-only list route**

Implement:
- `instance_tools` table with:
  - `id uuid primary key default gen_random_uuid()`
  - `instance_id uuid not null references instances(id) on delete cascade`
  - `tool_type text not null`
  - `name text not null`
  - `enabled boolean not null default true`
  - `config jsonb not null default '{}'::jsonb`
  - `created_at timestamptz not null default now()`
  - `updated_at timestamptz not null default now()`
- index on `(instance_id, enabled)`
- `GET /v1/instances/:id/tools`
  - returns `[{ id, tool_type, name, enabled, config: <sanitized subset> }]`
  - for `mail`, keep only UI-safe config such as `base_url`, `username`, and optional display defaults; never return password

**Step 4: Re-run the focused tests and verify they pass**

Run:
```bash
pnpm exec vitest run tests/db.test.ts tests/instance-tools.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add migrations/008_instance_tools.sql src/server.ts src/routes/instance-tools.ts tests/db.test.ts tests/instance-tools.test.ts
git commit -m "feat: add instance tool storage"
```

### Task 2: Add Mailpit proxy endpoints and audit records

**Files:**
- Create: `src/mailpit/client.ts`
- Modify: `src/routes/instance-tools.ts`
- Modify: `src/events/store.ts`
- Modify: `tests/instance-tools.test.ts`
- Modify: `tests/events-api.test.ts`

**Step 1: Extend the failing backend tests**

Add coverage for:
- `POST /v1/instances/:id/tools/:toolId/mail/send` proxies Mailpit `/send`
- `GET /v1/instances/:id/tools/:toolId/mail/messages` proxies `/messages`
- `GET /v1/instances/:id/tools/:toolId/mail/messages?query=...` proxies `/search`
- `GET /v1/instances/:id/tools/:toolId/mail/messages/:messageId` proxies `/message/{id}`
- unsupported `tool_type` returns `400`
- disabled tool returns `409`
- Mailpit non-2xx response becomes a Fleet `502`
- send/query writes a Fleet audit event and artifact summary without leaking stored credentials

**Step 2: Run the focused tests and verify they fail**

Run:
```bash
pnpm exec vitest run tests/instance-tools.test.ts tests/events-api.test.ts
```

Expected: FAIL because the proxy endpoints and mail client do not exist.

**Step 3: Implement the minimal Mailpit client and routes**

Implement:
- `createMailpitClient({ baseUrl, username, password, fetcher })`
- methods:
  - `listMessages({ start, limit })`
  - `searchMessages({ query, start, limit })`
  - `getMessage(id)`
  - `sendMessage(payload)`
- route behavior:
  - choose `/messages` or `/search` based on `query`
  - accept minimal send payload:
    - `from_email`
    - `from_name`
    - `to_email`
    - `to_name`
    - `subject`
    - `text`
    - optional `html`
- audit writes:
  - event types like `tool.mail.query` and `tool.mail.send`
  - artifact kinds like `tool.mail.query` and `tool.mail.send`
  - payload includes `tool_id`, `tool_name`, `instance_id`, request summary, response summary

**Step 4: Re-run the focused tests and verify they pass**

Run:
```bash
pnpm exec vitest run tests/instance-tools.test.ts tests/events-api.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/mailpit/client.ts src/routes/instance-tools.ts src/events/store.ts tests/instance-tools.test.ts tests/events-api.test.ts
git commit -m "feat: proxy instance mail tools through control plane"
```

### Task 3: Add instance tools UI and Mail modal workflow

**Files:**
- Modify: `ui/src/api/client.ts`
- Modify: `ui/src/types.ts`
- Modify: `ui/src/pages/Instances.tsx`
- Modify: `ui/src/styles.css`
- Modify: `tests/ui/instances-page.test.tsx`

**Step 1: Write the failing UI tests first**

Add coverage for:
- each instance row shows a `工具` button
- opening the modal loads `/v1/instances/:id/tools`
- mail tool modal can:
  - send one message
  - list recent messages
  - search messages via query
  - open one message detail
- send success shows a visible confirmation
- backend-only tool config does not appear in the browser payload

**Step 2: Run the focused UI test and verify it fails**

Run:
```bash
pnpm exec vitest run tests/ui/instances-page.test.tsx
```

Expected: FAIL because the tool modal and API client methods do not exist.

**Step 3: Implement the minimal operator UI**

Implement:
- API client methods:
  - `listInstanceTools(instanceId)`
  - `listInstanceMailMessages(instanceId, toolId, filters)`
  - `getInstanceMailMessage(instanceId, toolId, messageId)`
  - `sendInstanceMail(instanceId, toolId, payload)`
- UI in `InstancesPage`:
  - add `工具` button per row
  - modal lists configured tools
  - when `tool_type === "mail"`, show:
    - send form
    - query/search input
    - recent messages table
    - detail pane for selected message
- keep the UI intentionally temporary and operator-facing; no generic tool builder

**Step 4: Re-run the focused UI test and verify it passes**

Run:
```bash
pnpm exec vitest run tests/ui/instances-page.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add ui/src/api/client.ts ui/src/types.ts ui/src/pages/Instances.tsx ui/src/styles.css tests/ui/instances-page.test.tsx
git commit -m "feat(ui): add instance mail tool modal"
```

### Task 4: Verify the branch end-to-end

**Files:**
- Modify: `docs/plans/2026-03-22-instance-mail-tools.md`

**Step 1: Run the relevant focused suites**

Run:
```bash
pnpm exec vitest run tests/db.test.ts tests/instance-tools.test.ts tests/events-api.test.ts tests/ui/instances-page.test.tsx
```

Expected: PASS.

**Step 2: Run the full regression suite**

Run:
```bash
pnpm test
```

Expected: PASS.

**Step 3: Build the server and UI**

Run:
```bash
pnpm build
pnpm ui:build
```

Expected: PASS.

**Step 4: Review diff and status**

Run:
```bash
git status --short
git diff --stat
```

Expected: only the intended mail-tool files are modified.

**Step 5: Commit final polish if needed**

```bash
git add .
git commit -m "feat: finish instance mail tools"
```
