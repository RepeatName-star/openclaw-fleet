# Control Plane UI (V1) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship a V1 control plane UI (SPA served by the API) that supports instance monitoring, task creation/history, skills management, and memory/persona updates, plus OpenClaw console links.

**Architecture:** Add read/query APIs to the control plane, extend sidecar ack to carry `skills.status` results, and build a React SPA (Vite) served by Fastify static hosting. UI polls for state and posts tasks to existing endpoints.

**Tech Stack:** Fastify + Postgres + Redis, TypeScript, Vite + React.

---

### Task 1: Add instance/task metadata columns

**Files:**
- Create: `migrations/002_instance_task_metadata.sql`
- Modify: `tests/db.test.ts`

**Step 1: Write the failing test**
```ts
import { initTestDb, runMigrations } from "./support/db";

test("migrations add instance/task metadata columns", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const res = db.public.query(
    "select column_name from information_schema.columns where table_name='instances'",
  );
  const columns = res.rows.map((row) => row.column_name);
  expect(columns).toContain("control_ui_url");
  expect(columns).toContain("skills_snapshot");
  expect(columns).toContain("skills_snapshot_at");
  const taskColumns = db.public.query(
    "select column_name from information_schema.columns where table_name='tasks'",
  );
  const taskNames = taskColumns.rows.map((row) => row.column_name);
  expect(taskNames).toContain("result");
});
```

**Step 2: Run test to verify it fails**
Run: `pnpm test tests/db.test.ts`
Expected: FAIL with missing columns.

**Step 3: Write minimal implementation**
```sql
-- migrations/002_instance_task_metadata.sql
ALTER TABLE instances
  ADD COLUMN IF NOT EXISTS control_ui_url text,
  ADD COLUMN IF NOT EXISTS skills_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS skills_snapshot_at timestamptz;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS result jsonb;
```

**Step 4: Run test to verify it passes**
Run: `pnpm test tests/db.test.ts`
Expected: PASS.

**Step 5: Commit**
```bash
git add migrations/002_instance_task_metadata.sql tests/db.test.ts
git commit -m "feat: add instance metadata and task result columns"
```

---

### Task 2: Add instance query/update routes

**Files:**
- Create: `src/routes/instances.ts`
- Modify: `src/redis.ts`
- Modify: `src/server.ts`
- Test: `tests/instances.test.ts`

**Step 1: Write the failing tests**
```ts
import { buildServer } from "../src/server";
import { initTestDb, runMigrations } from "./support/db";

const redis = { set: async () => "OK", get: async () => null };

test("GET /v1/instances returns list with online=false", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = db.adapters.createPg().pool;
  await pool.query("insert into instances (name) values ('i-1')");
  const app = await buildServer({ pool, redis });
  const res = await app.inject({ method: "GET", url: "/v1/instances" });
  expect(res.statusCode).toBe(200);
  expect(res.json().items[0]).toMatchObject({ name: "i-1", online: false });
});

test("PATCH /v1/instances/:id updates control_ui_url", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = db.adapters.createPg().pool;
  const created = await pool.query("insert into instances (name) values ('i-1') returning id");
  const app = await buildServer({ pool, redis });
  const res = await app.inject({
    method: "PATCH",
    url: `/v1/instances/${created.rows[0].id}`,
    payload: { control_ui_url: "http://localhost:18789" },
  });
  expect(res.statusCode).toBe(200);
  expect(res.json().control_ui_url).toBe("http://localhost:18789");
});
```

**Step 2: Run tests to verify they fail**
Run: `pnpm test tests/instances.test.ts`
Expected: FAIL (route not found/type errors).

**Step 3: Write minimal implementation**
```ts
// src/redis.ts
export type RedisLike = {
  set: (...args: any[]) => Promise<unknown>;
  get: (...args: any[]) => Promise<string | null>;
};
```
```ts
// src/routes/instances.ts
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { RedisLike } from "../redis";

const PatchSchema = z.object({
  name: z.string().min(1).optional(),
  control_ui_url: z.string().url().optional(),
});

type Options = { pool?: Pool; redis?: RedisLike };

export async function registerInstanceRoutes(app: FastifyInstance, opts: Options) {
  app.get("/v1/instances", async (_req, reply) => {
    if (!opts.pool || !opts.redis) {
      reply.code(500).send({ error: "server not configured" });
      return;
    }
    const res = await opts.pool.query("select id, name, updated_at, control_ui_url, skills_snapshot_at from instances order by created_at asc");
    const items = [] as any[];
    for (const row of res.rows) {
      const hb = await opts.redis.get(`hb:${row.id}`);
      items.push({
        id: row.id,
        name: row.name,
        updated_at: row.updated_at,
        control_ui_url: row.control_ui_url,
        skills_snapshot_at: row.skills_snapshot_at,
        online: Boolean(hb),
      });
    }
    reply.send({ items });
  });

  app.get("/v1/instances/:id", async (req, reply) => {
    if (!opts.pool) {
      reply.code(500).send({ error: "server not configured" });
      return;
    }
    const { id } = req.params as { id: string };
    const res = await opts.pool.query(
      "select id, name, updated_at, control_ui_url, skills_snapshot, skills_snapshot_at from instances where id = $1",
      [id],
    );
    if (!res.rowCount) {
      reply.code(404).send({ error: "not found" });
      return;
    }
    reply.send(res.rows[0]);
  });

  app.patch("/v1/instances/:id", async (req, reply) => {
    if (!opts.pool) {
      reply.code(500).send({ error: "server not configured" });
      return;
    }
    const parsed = PatchSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid payload" });
      return;
    }
    const { id } = req.params as { id: string };
    const data = parsed.data;
    const res = await opts.pool.query(
      "update instances set name = coalesce($2, name), control_ui_url = coalesce($3, control_ui_url), updated_at = now() where id = $1 returning id, name, control_ui_url",
      [id, data.name ?? null, data.control_ui_url ?? null],
    );
    if (!res.rowCount) {
      reply.code(404).send({ error: "not found" });
      return;
    }
    reply.send(res.rows[0]);
  });
}
```
```ts
// src/server.ts
import { registerInstanceRoutes } from "./routes/instances";
// ...
await registerInstanceRoutes(app, options);
```

**Step 4: Run tests to verify they pass**
Run: `pnpm test tests/instances.test.ts`
Expected: PASS.

**Step 5: Commit**
```bash
git add src/redis.ts src/routes/instances.ts src/server.ts tests/instances.test.ts
git commit -m "feat: add instance list/detail/update routes"
```

---

### Task 3: Add task query and attempts routes

**Files:**
- Create: `src/routes/tasks-query.ts`
- Modify: `src/server.ts`
- Test: `tests/tasks-query.test.ts`

**Step 1: Write the failing tests**
```ts
import { buildServer } from "../src/server";
import { initTestDb, runMigrations } from "./support/db";

test("GET /v1/tasks returns list", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = db.adapters.createPg().pool;
  await pool.query("insert into tasks (target_type, target_id, action) values ('instance','i-1','agent.run')");
  const app = await buildServer({ pool });
  const res = await app.inject({ method: "GET", url: "/v1/tasks" });
  expect(res.statusCode).toBe(200);
  expect(res.json().items[0].action).toBe("agent.run");
});

test("GET /v1/tasks/:id/attempts returns attempts", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = db.adapters.createPg().pool;
  const task = await pool.query("insert into tasks (target_type, target_id, action) values ('instance','i-1','agent.run') returning id");
  await pool.query("insert into task_attempts (task_id, attempt, status, error) values ($1, 1, 'error', 'boom')", [task.rows[0].id]);
  const app = await buildServer({ pool });
  const res = await app.inject({ method: "GET", url: `/v1/tasks/${task.rows[0].id}/attempts` });
  expect(res.statusCode).toBe(200);
  expect(res.json().items[0].error).toBe("boom");
});
```

**Step 2: Run tests to verify they fail**
Run: `pnpm test tests/tasks-query.test.ts`
Expected: FAIL (route not found).

**Step 3: Write minimal implementation**
```ts
// src/routes/tasks-query.ts
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";

const QuerySchema = z.object({
  status: z.string().optional(),
  action: z.string().optional(),
  target_type: z.string().optional(),
  target_id: z.string().optional(),
});

type Options = { pool?: Pool };

export async function registerTasksQueryRoutes(app: FastifyInstance, opts: Options) {
  app.get("/v1/tasks", async (req, reply) => {
    if (!opts.pool) {
      reply.code(500).send({ error: "server not configured" });
      return;
    }
    const parsed = QuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid query" });
      return;
    }
    const { status, action, target_type, target_id } = parsed.data;
    const filters: string[] = [];
    const values: any[] = [];
    if (status) { values.push(status); filters.push(`status = $${values.length}`); }
    if (action) { values.push(action); filters.push(`action = $${values.length}`); }
    if (target_type) { values.push(target_type); filters.push(`target_type = $${values.length}`); }
    if (target_id) { values.push(target_id); filters.push(`target_id = $${values.length}`); }
    const where = filters.length ? `where ${filters.join(" and ")}` : "";
    const res = await opts.pool.query(
      `select id, target_type, target_id, action, status, attempts, updated_at from tasks ${where} order by created_at desc limit 200`,
      values,
    );
    reply.send({ items: res.rows });
  });

  app.get("/v1/tasks/:id", async (req, reply) => {
    if (!opts.pool) {
      reply.code(500).send({ error: "server not configured" });
      return;
    }
    const { id } = req.params as { id: string };
    const res = await opts.pool.query("select * from tasks where id = $1", [id]);
    if (!res.rowCount) {
      reply.code(404).send({ error: "not found" });
      return;
    }
    reply.send(res.rows[0]);
  });

  app.get("/v1/tasks/:id/attempts", async (req, reply) => {
    if (!opts.pool) {
      reply.code(500).send({ error: "server not configured" });
      return;
    }
    const { id } = req.params as { id: string };
    const res = await opts.pool.query(
      "select attempt, status, error, started_at, finished_at from task_attempts where task_id = $1 order by attempt asc",
      [id],
    );
    reply.send({ items: res.rows });
  });
}
```
```ts
// src/server.ts
import { registerTasksQueryRoutes } from "./routes/tasks-query";
// ...
await registerTasksQueryRoutes(app, options);
```

**Step 4: Run tests to verify they pass**
Run: `pnpm test tests/tasks-query.test.ts`
Expected: PASS.

**Step 5: Commit**
```bash
git add src/routes/tasks-query.ts src/server.ts tests/tasks-query.test.ts
git commit -m "feat: add task query and attempts routes"
```

---

### Task 4: Support skills.status results in task ack

**Files:**
- Modify: `src/routes/tasks-ack.ts`
- Modify: `src/sidecar/control-plane.ts`
- Modify: `src/sidecar/scheduler.ts`
- Modify: `src/sidecar/executor.ts`
- Modify: `src/sidecar/providers/types.ts`
- Modify: `src/sidecar/providers/openclaw.ts`
- Test: `tests/sidecar/scheduler.test.ts`
- Test: `tests/tasks-ack.test.ts`

**Step 1: Write the failing tests**
```ts
// tests/tasks-ack.test.ts
import { buildServer } from "../src/server";
import { initTestDb, runMigrations } from "./support/db";

test("POST /v1/tasks/ack stores result and skills snapshot", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = db.adapters.createPg().pool;
  const instance = await pool.query("insert into instances (name) values ('i-1') returning id");
  const task = await pool.query(
    "insert into tasks (target_type, target_id, action) values ('instance', $1, 'skills.status') returning id",
    [instance.rows[0].id],
  );
  const app = await buildServer({ pool });
  const res = await app.inject({
    method: "POST",
    url: "/v1/tasks/ack",
    headers: { authorization: "Bearer test" },
    payload: { task_id: task.rows[0].id, status: "ok", result: { skills: [{ skillKey: "weather" }] } },
  });
  expect(res.statusCode).toBe(200);
  const updated = await pool.query("select skills_snapshot from instances where id = $1", [instance.rows[0].id]);
  expect(updated.rows[0].skills_snapshot.skills[0].skillKey).toBe("weather");
});
```
```ts
// tests/sidecar/scheduler.test.ts (new case)
import { createScheduler } from "../src/sidecar/scheduler";

// expect ackTask called with result when executor returns one
```

**Step 2: Run tests to verify they fail**
Run: `pnpm test tests/tasks-ack.test.ts tests/sidecar/scheduler.test.ts`
Expected: FAIL (schema/ack signature missing).

**Step 3: Write minimal implementation**
```ts
// src/sidecar/providers/types.ts
export type SkillsStatusParams = Record<string, never>;

export interface SidecarProvider {
  // ...
  skillsStatus(params: SkillsStatusParams): Promise<unknown>;
}
```
```ts
// src/sidecar/providers/openclaw.ts
async skillsStatus() {
  return gateway.request("skills.status");
},
```
```ts
// src/sidecar/executor.ts
// return results map
const results: Record<string, unknown> = {};
// when action = skills.status, store results[task.id] = await provider.skillsStatus(...)
```
```ts
// src/sidecar/scheduler.ts
// pass result to ackTask
await options.controlPlane.ackTask(options.deviceToken, task.id, status, errorMessage, resultForTask);
```
```ts
// src/sidecar/control-plane.ts
body: JSON.stringify({ task_id: taskId, status, error, result }),
```
```ts
// src/routes/tasks-ack.ts
const AckSchema = z.object({
  task_id: z.string().min(1),
  status: z.enum(["ok", "error"]),
  error: z.string().optional(),
  result: z.unknown().optional(),
});
// when status ok: update tasks.result
// if action === 'skills.status' && target_type === 'instance' => update instances.skills_snapshot and skills_snapshot_at
```

**Step 4: Run tests to verify they pass**
Run: `pnpm test tests/tasks-ack.test.ts tests/sidecar/scheduler.test.ts`
Expected: PASS.

**Step 5: Commit**
```bash
git add src/sidecar/providers/types.ts src/sidecar/providers/openclaw.ts src/sidecar/executor.ts src/sidecar/scheduler.ts src/sidecar/control-plane.ts src/routes/tasks-ack.ts tests/tasks-ack.test.ts tests/sidecar/scheduler.test.ts
git commit -m "feat: store skills status results and snapshots"
```

---

### Task 5: Add skills snapshot read endpoint

**Files:**
- Modify: `src/routes/instances.ts`
- Test: `tests/instances.test.ts`

**Step 1: Write the failing test**
```ts
// tests/instances.test.ts
// add
const skillRes = await app.inject({ method: "GET", url: `/v1/instances/${id}/skills` });
expect(skillRes.statusCode).toBe(200);
expect(skillRes.json().skills).toBeDefined();
```

**Step 2: Run test to verify it fails**
Run: `pnpm test tests/instances.test.ts`
Expected: FAIL (route not found).

**Step 3: Write minimal implementation**
```ts
// src/routes/instances.ts
app.get("/v1/instances/:id/skills", async (req, reply) => {
  if (!opts.pool) {
    reply.code(500).send({ error: "server not configured" });
    return;
  }
  const { id } = req.params as { id: string };
  const res = await opts.pool.query(
    "select skills_snapshot, skills_snapshot_at from instances where id = $1",
    [id],
  );
  if (!res.rowCount) {
    reply.code(404).send({ error: "not found" });
    return;
  }
  reply.send({ skills: res.rows[0].skills_snapshot, updated_at: res.rows[0].skills_snapshot_at });
});
```

**Step 4: Run tests to verify they pass**
Run: `pnpm test tests/instances.test.ts`
Expected: PASS.

**Step 5: Commit**
```bash
git add src/routes/instances.ts tests/instances.test.ts
git commit -m "feat: add instance skills snapshot endpoint"
```

---

### Task 6: UI scaffold (Vite + React) and static hosting

**Files:**
- Create: `ui/` (Vite React app)
- Modify: `package.json`
- Modify: `src/server.ts`

**Step 1: Write the failing test (build check)**
No unit test. Use build command.

**Step 2: Run build to verify it fails**
Run: `pnpm ui:build`
Expected: FAIL (script missing).

**Step 3: Write minimal implementation**
- Create `ui/` using Vite React + TS
- Set `build.outDir = "../dist/ui"` and `base = "/"`
- Add scripts:
  - `ui:dev`: `vite --config ui/vite.config.ts`
  - `ui:build`: `vite build --config ui/vite.config.ts`
- Add dependency: `@fastify/static`
- Serve UI from API:
```ts
import path from "node:path";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";

const root = path.resolve(process.cwd(), "dist/ui");
await app.register(fastifyStatic, { root, prefix: "/" });
app.setNotFoundHandler((req, reply) => {
  if (req.method !== "GET") {
    reply.code(404).send({ error: "not found" });
    return;
  }
  reply.sendFile("index.html");
});
```

**Step 4: Run build to verify it passes**
Run: `pnpm ui:build`
Expected: SUCCESS.

**Step 5: Commit**
```bash
git add ui package.json src/server.ts
git commit -m "feat: add UI scaffold and static hosting"
```

---

### Task 7: UI data client + pages (Instances, Tasks, Skills, Memory)

**Files:**
- Create: `ui/src/api/client.ts`
- Create: `ui/src/pages/Instances.tsx`
- Create: `ui/src/pages/Tasks.tsx`
- Create: `ui/src/pages/TaskDetail.tsx`
- Create: `ui/src/pages/Skills.tsx`
- Create: `ui/src/pages/Memory.tsx`
- Create: `ui/src/components/TaskModal.tsx`
- Create: `ui/src/components/Filters.tsx`
- Modify: `ui/src/App.tsx`, `ui/src/main.tsx`, `ui/src/styles.css`

**Step 1: Write the failing test (manual UI smoke)**
No unit test. Use manual run.

**Step 2: Run UI dev server**
Run: `pnpm ui:dev`
Expected: renders shell but no data.

**Step 3: Implement minimal UI with required interactions**
- Instances page: list, online badge, last heartbeat, control UI link
- Tasks page: list, filters, status badge
- Task detail: payload + attempts table + retry button
- Skills page: instance selector + snapshot table + enable/disable + refresh status
- Memory page: editor + instance selector + submit task
- Task modal: create tasks for `agent.run`, `session.reset`, `memory.replace`, `skills.update`, `skills.install`, `skills.status`
- Styling: define CSS variables, non-default font family, gradient background, and light motion for list entry.

**Step 4: Manual verification**
- Run API: `pnpm dev`
- Run UI build: `pnpm ui:build`
- Open `/` and verify all pages load + task creation works.

**Step 5: Commit**
```bash
git add ui
 git commit -m "feat: implement V1 control plane UI"
```

---

### Task 8: Docs update

**Files:**
- Modify: `README.md`

**Step 1: Update docs**
- Add UI build/run instructions
- Mention new endpoints

**Step 2: Commit**
```bash
git add README.md
git commit -m "docs: add control plane UI usage"
```

---

## Verification Checklist
- `pnpm test`
- `pnpm ui:build`
- `pnpm build`

