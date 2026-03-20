import { issueDeviceToken } from "../src/auth.js";
import { buildServer } from "../src/server.js";
import { createTestPool, initTestDb, runMigrations } from "./support/db.js";

const EXPECTED_FILE_NAMES = [
  "AGENTS.md",
  "SOUL.md",
  "TOOLS.md",
  "IDENTITY.md",
  "USER.md",
  "HEARTBEAT.md",
  "BOOTSTRAP.md",
  "MEMORY.md",
];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForLatestTask(pool: ReturnType<typeof createTestPool>, action: string) {
  for (let i = 0; i < 50; i += 1) {
    const task = await pool.query(
      "select id, action, payload from tasks where action = $1 order by created_at desc limit 1",
      [action],
    );
    if (task.rowCount) {
      return task.rows[0];
    }
    await sleep(10);
  }
  throw new Error(`timed out waiting for task ${action}`);
}

test("GET /v1/instances/:id/files only exposes the approved whitelist", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  const created = await pool.query("insert into instances (name) values ($1) returning id", ["i-1"]);
  const instanceId = String(created.rows[0].id);
  const deviceToken = await issueDeviceToken(pool, { instanceId, scopes: ["operator.admin"] });
  const redis = { set: async () => "OK", get: async () => null };
  const app = await buildServer({ pool, redis });

  const responsePromise = app.inject({
    method: "GET",
    url: `/v1/instances/${instanceId}/files`,
  });

  const task = await waitForLatestTask(pool, "agents.files.list");
  expect(task.payload).toMatchObject({ agentId: "main" });

  const ack = await app.inject({
    method: "POST",
    url: "/v1/tasks/ack",
    headers: { authorization: `Bearer ${deviceToken}` },
    payload: {
      task_id: task.id,
      status: "ok",
      result: {
        files: [
          { name: "AGENTS.md", path: "/workspace/AGENTS.md", missing: false, size: 12, updatedAtMs: 100 },
          { name: "hack.txt", path: "/workspace/hack.txt", missing: false, size: 99, updatedAtMs: 100 },
        ],
      },
    },
  });
  expect(ack.statusCode).toBe(200);

  const res = await responsePromise;
  expect(res.statusCode).toBe(200);
  expect(res.json().items.map((item: any) => item.name)).toEqual(EXPECTED_FILE_NAMES);
  expect(res.json().items.find((item: any) => item.name === "AGENTS.md")).toMatchObject({
    name: "AGENTS.md",
    missing: false,
    size: 12,
    updated_at_ms: 100,
  });
  expect(res.json().items.find((item: any) => item.name === "MEMORY.md")).toMatchObject({
    name: "MEMORY.md",
    missing: true,
  });
});

test("GET /v1/instances/:id/files/:name returns file contents", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  const created = await pool.query("insert into instances (name) values ($1) returning id", ["i-1"]);
  const instanceId = String(created.rows[0].id);
  const deviceToken = await issueDeviceToken(pool, { instanceId, scopes: ["operator.admin"] });
  const redis = { set: async () => "OK", get: async () => null };
  const app = await buildServer({ pool, redis });

  const responsePromise = app.inject({
    method: "GET",
    url: `/v1/instances/${instanceId}/files/AGENTS.md`,
  });

  const task = await waitForLatestTask(pool, "agents.files.get");
  expect(task.payload).toMatchObject({ agentId: "main", name: "AGENTS.md" });

  const ack = await app.inject({
    method: "POST",
    url: "/v1/tasks/ack",
    headers: { authorization: `Bearer ${deviceToken}` },
    payload: {
      task_id: task.id,
      status: "ok",
      result: {
        file: {
          name: "AGENTS.md",
          path: "/workspace/AGENTS.md",
          missing: false,
          size: 18,
          updatedAtMs: 200,
          content: "# agent policy\n",
        },
      },
    },
  });
  expect(ack.statusCode).toBe(200);

  const res = await responsePromise;
  expect(res.statusCode).toBe(200);
  expect(res.json()).toMatchObject({
    name: "AGENTS.md",
    missing: false,
    size: 18,
    updated_at_ms: 200,
    content: "# agent policy\n",
  });
});

test("PUT /v1/instances/:id/files/:name writes updated content", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  const created = await pool.query("insert into instances (name) values ($1) returning id", ["i-1"]);
  const instanceId = String(created.rows[0].id);
  const deviceToken = await issueDeviceToken(pool, { instanceId, scopes: ["operator.admin"] });
  const redis = { set: async () => "OK", get: async () => null };
  const app = await buildServer({ pool, redis });

  const responsePromise = app.inject({
    method: "PUT",
    url: `/v1/instances/${instanceId}/files/AGENTS.md`,
    payload: { content: "# updated\n" },
  });

  const task = await waitForLatestTask(pool, "agents.files.set");
  expect(task.payload).toMatchObject({
    agentId: "main",
    name: "AGENTS.md",
    content: "# updated\n",
  });

  const ack = await app.inject({
    method: "POST",
    url: "/v1/tasks/ack",
    headers: { authorization: `Bearer ${deviceToken}` },
    payload: {
      task_id: task.id,
      status: "ok",
      result: {
        ok: true,
        file: {
          name: "AGENTS.md",
          path: "/workspace/AGENTS.md",
          missing: false,
          size: 10,
          updatedAtMs: 300,
          content: "# updated\n",
        },
      },
    },
  });
  expect(ack.statusCode).toBe(200);

  const res = await responsePromise;
  expect(res.statusCode).toBe(200);
  expect(res.json()).toMatchObject({
    ok: true,
    file: {
      name: "AGENTS.md",
      missing: false,
      size: 10,
      updated_at_ms: 300,
      content: "# updated\n",
    },
  });
});

test("GET /v1/instances/:id/files/:name surfaces sidecar errors", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  const created = await pool.query("insert into instances (name) values ($1) returning id", ["i-1"]);
  const instanceId = String(created.rows[0].id);
  const deviceToken = await issueDeviceToken(pool, { instanceId, scopes: ["operator.admin"] });
  const redis = { set: async () => "OK", get: async () => null };
  const app = await buildServer({ pool, redis });

  const responsePromise = app.inject({
    method: "GET",
    url: `/v1/instances/${instanceId}/files/AGENTS.md`,
  });

  const task = await waitForLatestTask(pool, "agents.files.get");
  const ack = await app.inject({
    method: "POST",
    url: "/v1/tasks/ack",
    headers: { authorization: `Bearer ${deviceToken}` },
    payload: {
      task_id: task.id,
      status: "error",
      error: "workspace file read failed",
    },
  });
  expect(ack.statusCode).toBe(200);

  const res = await responsePromise;
  expect(res.statusCode).toBe(502);
  expect(res.json()).toEqual({ error: "workspace file read failed" });
});
