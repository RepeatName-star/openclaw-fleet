# OpenClaw Fleet Control Plane Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a minimal control plane API (with Postgres + Redis) that supports instance enrollment, heartbeats, task dispatch, and task acknowledgements for OpenClaw sidecars.

**Architecture:** Fastify HTTP API with Zod-validated config, Postgres for durable state (instances, groups, tasks), Redis for heartbeats + task leases, and a repository layer for DB operations. Tasks are claimed via Redis leases and confirmed via Postgres status transitions.

**Tech Stack:** Node.js + TypeScript, Fastify, Zod, pg, ioredis, Vitest, pg-mem (unit tests).

---

### Task 1: Project bootstrap + health endpoint

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/server.ts`
- Create: `src/index.ts`
- Create: `src/routes/health.ts`
- Create: `tests/health.test.ts`

**Step 1: Write the failing test**
```ts
import { buildServer } from "../src/server";

test("GET /health returns ok", async () => {
  const app = await buildServer();
  const res = await app.inject({ method: "GET", url: "/health" });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ ok: true });
});
```

**Step 2: Run test to verify it fails**
Run: `pnpm test`
Expected: FAIL with module not found / buildServer missing.

**Step 3: Write minimal implementation**
- `package.json`: add scripts `dev`, `build`, `start`, `test`; deps: `fastify`, devDeps: `typescript`, `ts-node`, `vitest`, `@types/node`.
- `src/server.ts`: export `buildServer()` creating Fastify instance and registering `/health` route.
- `src/routes/health.ts`: handler returns `{ ok: true }`.
- `src/index.ts`: start server on `PORT` (default 3000).

**Step 4: Run test to verify it passes**
Run: `pnpm test`
Expected: PASS 1 test.

**Step 5: Commit**
```bash
git add package.json tsconfig.json src/index.ts src/server.ts src/routes/health.ts tests/health.test.ts
 git commit -m "feat: bootstrap server with health endpoint"
```

---

### Task 2: Config loader (env + validation)

**Files:**
- Create: `src/config.ts`
- Modify: `src/index.ts`
- Create: `tests/config.test.ts`
- Create: `.env.example`

**Step 1: Write the failing test**
```ts
import { loadConfig } from "../src/config";

test("loadConfig requires DATABASE_URL and REDIS_URL", () => {
  expect(() => loadConfig({} as NodeJS.ProcessEnv)).toThrow();
});
```

**Step 2: Run test to verify it fails**
Run: `pnpm test`
Expected: FAIL with module not found / loadConfig missing.

**Step 3: Write minimal implementation**
- `src/config.ts`: Zod schema for `PORT`, `DATABASE_URL`, `REDIS_URL`, `ENROLLMENT_SECRET`.
- `src/index.ts`: use `loadConfig(process.env)` and start server with config.
- `.env.example`: provide required keys.

**Step 4: Run test to verify it passes**
Run: `pnpm test`
Expected: PASS.

**Step 5: Commit**
```bash
git add src/config.ts src/index.ts tests/config.test.ts .env.example
 git commit -m "feat: add config loader with env validation"
```

---

### Task 3: Database schema + migration runner

**Files:**
- Create: `migrations/001_init.sql`
- Create: `src/db.ts`
- Create: `src/db/migrate.ts`
- Create: `tests/db.test.ts`

**Step 1: Write the failing test**
```ts
import { initTestDb, runMigrations } from "./support/db";

test("migrations create core tables", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const res = db.public.query(`SELECT to_regclass('instances') as t`);
  expect(res.rows[0].t).toBe("instances");
});
```

**Step 2: Run test to verify it fails**
Run: `pnpm test`
Expected: FAIL due to missing helpers/migrations.

**Step 3: Write minimal implementation**
- `migrations/001_init.sql` creates:
  - `instances` (id uuid pk, name, created_at, updated_at)
  - `groups` (id uuid pk, name)
  - `group_instances` (group_id, instance_id)
  - `enrollment_tokens` (token pk, expires_at, used_at)
  - `device_tokens` (token pk, instance_id, scopes, revoked_at)
  - `tasks` (id uuid pk, target_type, target_id, action, payload jsonb, status, attempts, lease_expires_at, created_at, updated_at, expires_at)
  - `task_attempts` (id uuid pk, task_id, attempt, status, error, started_at, finished_at)
- `src/db.ts`: `createPool(config)` and query helper.
- `src/db/migrate.ts`: run SQL files in order.
- `tests/support/db.ts`: use `pg-mem` to run migrations in memory.

**Step 4: Run test to verify it passes**
Run: `pnpm test`
Expected: PASS.

**Step 5: Commit**
```bash
git add migrations/001_init.sql src/db.ts src/db/migrate.ts tests/db.test.ts tests/support/db.ts
 git commit -m "feat: add db schema and migration runner"
```

---

### Task 4: Enrollment + device auth middleware

**Files:**
- Create: `src/auth.ts`
- Create: `src/routes/enroll.ts`
- Modify: `src/server.ts`
- Create: `tests/enroll.test.ts`

**Step 1: Write the failing test**
```ts
import { buildServer } from "../src/server";

test("POST /v1/enroll issues device token", async () => {
  const app = await buildServer();
  const res = await app.inject({ method: "POST", url: "/v1/enroll", payload: { enrollment_token: "test", instance_name: "i-1" } });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toHaveProperty("device_token");
});
```

**Step 2: Run test to verify it fails**
Run: `pnpm test`
Expected: FAIL with 404.

**Step 3: Write minimal implementation**
- `src/auth.ts`:
  - `requireDeviceToken` middleware (reads `Authorization: Bearer <token>`).
  - `issueDeviceToken` helper.
- `src/routes/enroll.ts`:
  - Validate `enrollment_token` against `ENROLLMENT_SECRET` (simple shared secret for MVP).
  - Create instance row if missing.
  - Issue device token and store in `device_tokens`.
- Register routes in `src/server.ts`.

**Step 4: Run test to verify it passes**
Run: `pnpm test`
Expected: PASS.

**Step 5: Commit**
```bash
git add src/auth.ts src/routes/enroll.ts src/server.ts tests/enroll.test.ts
 git commit -m "feat: add enrollment and device auth"
```

---

### Task 5: Heartbeat API (Redis + DB)

**Files:**
- Create: `src/routes/heartbeat.ts`
- Modify: `src/server.ts`
- Create: `tests/heartbeat.test.ts`

**Step 1: Write the failing test**
```ts
import { buildServer } from "../src/server";

test("POST /v1/heartbeat updates last_seen", async () => {
  const app = await buildServer();
  const res = await app.inject({ method: "POST", url: "/v1/heartbeat", headers: { authorization: "Bearer test" } });
  expect(res.statusCode).toBe(200);
});
```

**Step 2: Run test to verify it fails**
Run: `pnpm test`
Expected: FAIL with 404/401.

**Step 3: Write minimal implementation**
- `src/routes/heartbeat.ts`:
  - Auth required.
  - Update Redis key `hb:<instanceId>` with TTL (e.g., 60s).
  - Update `instances.updated_at` in Postgres.
- Register route in `src/server.ts`.

**Step 4: Run test to verify it passes**
Run: `pnpm test`
Expected: PASS.

**Step 5: Commit**
```bash
git add src/routes/heartbeat.ts src/server.ts tests/heartbeat.test.ts
 git commit -m "feat: add heartbeat endpoint"
```

---

### Task 6: Task pull (claim + lease)

**Files:**
- Create: `src/routes/tasks-pull.ts`
- Modify: `src/server.ts`
- Create: `tests/tasks-pull.test.ts`

**Step 1: Write the failing test**
```ts
import { buildServer } from "../src/server";

test("POST /v1/tasks/pull returns pending tasks", async () => {
  const app = await buildServer();
  const res = await app.inject({ method: "POST", url: "/v1/tasks/pull", headers: { authorization: "Bearer test" }, payload: { limit: 5 } });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toHaveProperty("tasks");
});
```

**Step 2: Run test to verify it fails**
Run: `pnpm test`
Expected: FAIL.

**Step 3: Write minimal implementation**
- `src/routes/tasks-pull.ts`:
  - Auth required.
  - Load candidate tasks for instance or its groups (status = pending, not expired).
  - For each candidate, attempt Redis lease `SET task:<id>:lease <instanceId> NX PX <ttl>`.
  - On success, update task row `status = leased`, `attempts += 1`, `lease_expires_at`.
  - Return leased tasks list.

**Step 4: Run test to verify it passes**
Run: `pnpm test`
Expected: PASS.

**Step 5: Commit**
```bash
git add src/routes/tasks-pull.ts src/server.ts tests/tasks-pull.test.ts
 git commit -m "feat: add task pull with leases"
```

---

### Task 7: Task ack (success/failure)

**Files:**
- Create: `src/routes/tasks-ack.ts`
- Modify: `src/server.ts`
- Create: `tests/tasks-ack.test.ts`

**Step 1: Write the failing test**
```ts
import { buildServer } from "../src/server";

test("POST /v1/tasks/ack marks task done", async () => {
  const app = await buildServer();
  const res = await app.inject({ method: "POST", url: "/v1/tasks/ack", headers: { authorization: "Bearer test" }, payload: { task_id: "t1", status: "ok" } });
  expect(res.statusCode).toBe(200);
});
```

**Step 2: Run test to verify it fails**
Run: `pnpm test`
Expected: FAIL.

**Step 3: Write minimal implementation**
- `src/routes/tasks-ack.ts`:
  - Auth required.
  - If status = ok: mark task `status = done` and clear lease.
  - If status = error: increment attempts and set back to pending if attempts < max, else failed.
  - Record attempt in `task_attempts`.

**Step 4: Run test to verify it passes**
Run: `pnpm test`
Expected: PASS.

**Step 5: Commit**
```bash
git add src/routes/tasks-ack.ts src/server.ts tests/tasks-ack.test.ts
 git commit -m "feat: add task acknowledgement"
```

---

### Task 8: Admin create-task endpoint (control plane UI/API)

**Files:**
- Create: `src/routes/tasks-admin.ts`
- Modify: `src/server.ts`
- Create: `tests/tasks-admin.test.ts`

**Step 1: Write the failing test**
```ts
import { buildServer } from "../src/server";

test("POST /v1/tasks creates a task", async () => {
  const app = await buildServer();
  const res = await app.inject({ method: "POST", url: "/v1/tasks", payload: { target_type: "group", target_id: "g1", action: "skills.update", payload: {} } });
  expect(res.statusCode).toBe(200);
});
```

**Step 2: Run test to verify it fails**
Run: `pnpm test`
Expected: FAIL.

**Step 3: Write minimal implementation**
- `src/routes/tasks-admin.ts`:
  - Validate payload (target_type, target_id, action, payload).
  - Insert new task with status = pending.
- Register route in `src/server.ts`.

**Step 4: Run test to verify it passes**
Run: `pnpm test`
Expected: PASS.

**Step 5: Commit**
```bash
git add src/routes/tasks-admin.ts src/server.ts tests/tasks-admin.test.ts
 git commit -m "feat: add admin task creation"
```

---

### Task 9: Minimal docs + runbook

**Files:**
- Create: `README.md`
- Create: `docs/api.md`

**Step 1: Write the failing test**
Not required.

**Step 2: Write minimal documentation**
- `README.md`: quick start, env vars, run commands.
- `docs/api.md`: endpoint list + example payloads.

**Step 3: Commit**
```bash
git add README.md docs/api.md
 git commit -m "docs: add quickstart and api overview"
```

---

## Verification Checklist
- `pnpm test` (all tests pass)
- `pnpm dev` runs server on configured port

