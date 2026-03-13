import { buildServer } from "../src/server.js";
import { issueDeviceToken } from "../src/auth.js";
import { createTestPool, initTestDb, runMigrations } from "./support/db.js";

test("POST /v1/tasks/ack marks task done", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);

  const created = await pool.query(
    "insert into instances (name) values ($1) returning id",
    ["i-1"],
  );
  const instanceId = created.rows[0].id as string;
  const token = await issueDeviceToken(pool, { instanceId, scopes: ["operator.admin"] });

  const task = await pool.query(
    "insert into tasks (target_type, target_id, action, payload) values ($1, $2, $3, $4) returning id",
    ["instance", instanceId, "skills.update", {}],
  );
  const taskId = task.rows[0].id as string;

  const app = await buildServer({ pool });
  const res = await app.inject({
    method: "POST",
    url: "/v1/tasks/ack",
    headers: { authorization: `Bearer ${token}` },
    payload: { task_id: taskId, status: "ok" },
  });
  expect(res.statusCode).toBe(200);

  const updated = await pool.query("select status from tasks where id = $1", [taskId]);
  expect(updated.rows[0].status).toBe("done");
});

test("POST /v1/tasks/ack stores skills snapshot result", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);

  const created = await pool.query(
    "insert into instances (name) values ($1) returning id",
    ["i-1"],
  );
  const instanceId = created.rows[0].id as string;
  const token = await issueDeviceToken(pool, { instanceId, scopes: ["operator.admin"] });

  const task = await pool.query(
    "insert into tasks (target_type, target_id, action, payload) values ($1, $2, $3, $4) returning id",
    ["instance", instanceId, "skills.status", {}],
  );
  const taskId = task.rows[0].id as string;

  const app = await buildServer({ pool });
  const res = await app.inject({
    method: "POST",
    url: "/v1/tasks/ack",
    headers: { authorization: `Bearer ${token}` },
    payload: {
      task_id: taskId,
      status: "ok",
      result: { skills: [{ skillKey: "weather" }] },
    },
  });
  expect(res.statusCode).toBe(200);

  const taskRow = await pool.query("select result from tasks where id = $1", [taskId]);
  expect(taskRow.rows[0].result.skills[0].skillKey).toBe("weather");
  const instanceRow = await pool.query(
    "select skills_snapshot from instances where id = $1",
    [instanceId],
  );
  expect(instanceRow.rows[0].skills_snapshot.skills[0].skillKey).toBe("weather");
});

test("tasks ack writes gateway facts for fleet.gateway.probe", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  const created = await pool.query("insert into instances (name) values ('i-1') returning id");
  const instanceId = created.rows[0].id as string;
  const token = await issueDeviceToken(pool, { instanceId, scopes: ["operator.admin"] });
  const task = await pool.query(
    "insert into tasks (target_type, target_id, action, payload) values ($1,$2,$3,$4) returning id",
    ["instance", instanceId, "fleet.gateway.probe", {}],
  );

  const app = await buildServer({ pool });
  const res = await app.inject({
    method: "POST",
    url: "/v1/tasks/ack",
    headers: { authorization: `Bearer ${token}` },
    payload: {
      task_id: task.rows[0].id,
      status: "ok",
      result: { gateway_reachable: true, openclaw_version: "2026.2.26" },
    },
  });
  expect(res.statusCode).toBe(200);

  const row = await pool.query(
    "select gateway_reachable, gateway_reachable_at, openclaw_version, openclaw_version_at from instances where id = $1",
    [instanceId],
  );
  expect(row.rows[0].gateway_reachable).toBe(true);
  expect(row.rows[0].gateway_reachable_at).toBeTruthy();
  expect(row.rows[0].openclaw_version).toBe("2026.2.26");
  expect(row.rows[0].openclaw_version_at).toBeTruthy();
});

test("skills.install ok invalidates skills snapshot", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  const created = await pool.query("insert into instances (name) values ('i-1') returning id");
  const instanceId = created.rows[0].id as string;
  const token = await issueDeviceToken(pool, { instanceId, scopes: ["operator.admin"] });
  const task = await pool.query(
    "insert into tasks (target_type, target_id, action, payload) values ($1,$2,$3,$4) returning id",
    ["instance", instanceId, "skills.install", {}],
  );

  const app = await buildServer({ pool });
  const res = await app.inject({
    method: "POST",
    url: "/v1/tasks/ack",
    headers: { authorization: `Bearer ${token}` },
    payload: { task_id: task.rows[0].id, status: "ok" },
  });
  expect(res.statusCode).toBe(200);

  const row = await pool.query("select skills_snapshot_invalidated_at from instances where id = $1", [
    instanceId,
  ]);
  expect(row.rows[0].skills_snapshot_invalidated_at).toBeTruthy();
});

test("fleet.skill_bundle.install ok invalidates skills snapshot", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  const created = await pool.query("insert into instances (name) values ('i-1') returning id");
  const instanceId = created.rows[0].id as string;
  const token = await issueDeviceToken(pool, { instanceId, scopes: ["operator.admin"] });
  const task = await pool.query(
    "insert into tasks (target_type, target_id, action, payload) values ($1,$2,$3,$4) returning id",
    ["instance", instanceId, "fleet.skill_bundle.install", {}],
  );

  const app = await buildServer({ pool });
  const res = await app.inject({
    method: "POST",
    url: "/v1/tasks/ack",
    headers: { authorization: `Bearer ${token}` },
    payload: { task_id: task.rows[0].id, status: "ok" },
  });
  expect(res.statusCode).toBe(200);

  const row = await pool.query("select skills_snapshot_invalidated_at from instances where id = $1", [
    instanceId,
  ]);
  expect(row.rows[0].skills_snapshot_invalidated_at).toBeTruthy();
});

test("skills.status error does not requeue immediately (probe backoff owns retries)", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  const created = await pool.query("insert into instances (name) values ('i-1') returning id");
  const instanceId = created.rows[0].id as string;
  const token = await issueDeviceToken(pool, { instanceId, scopes: ["operator.admin"] });
  const task = await pool.query(
    "insert into tasks (target_type, target_id, action, payload) values ($1,$2,$3,$4) returning id",
    ["instance", instanceId, "skills.status", {}],
  );
  const taskId = task.rows[0].id as string;

  const app = await buildServer({ pool });
  const res = await app.inject({
    method: "POST",
    url: "/v1/tasks/ack",
    headers: { authorization: `Bearer ${token}` },
    payload: {
      task_id: taskId,
      status: "error",
      error: "gateway unreachable",
    },
  });
  expect(res.statusCode).toBe(200);

  const row = await pool.query("select status from tasks where id = $1", [taskId]);
  expect(row.rows[0].status).toBe("failed");
});

test("fleet.gateway.probe updates probe backoff state on unreachable and resets on success", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  const created = await pool.query("insert into instances (name) values ('i-1') returning id");
  const instanceId = created.rows[0].id as string;
  const token = await issueDeviceToken(pool, { instanceId, scopes: ["operator.admin"] });

  const task1 = await pool.query(
    "insert into tasks (target_type, target_id, action, payload) values ($1,$2,$3,$4) returning id",
    ["instance", instanceId, "fleet.gateway.probe", {}],
  );

  const app = await buildServer({ pool });
  const res1 = await app.inject({
    method: "POST",
    url: "/v1/tasks/ack",
    headers: { authorization: `Bearer ${token}` },
    payload: {
      task_id: task1.rows[0].id,
      status: "ok",
      result: { gateway_reachable: false },
    },
  });
  expect(res1.statusCode).toBe(200);

  const state1 = await pool.query(
    "select consecutive_failures, next_allowed_at from instance_probe_states where instance_id = $1 and probe_kind = $2",
    [instanceId, "gateway"],
  );
  expect(state1.rows[0].consecutive_failures).toBe(1);
  expect(state1.rows[0].next_allowed_at).toBeTruthy();

  const task2 = await pool.query(
    "insert into tasks (target_type, target_id, action, payload) values ($1,$2,$3,$4) returning id",
    ["instance", instanceId, "fleet.gateway.probe", {}],
  );
  const res2 = await app.inject({
    method: "POST",
    url: "/v1/tasks/ack",
    headers: { authorization: `Bearer ${token}` },
    payload: {
      task_id: task2.rows[0].id,
      status: "ok",
      result: { gateway_reachable: true, openclaw_version: "2026.2.26" },
    },
  });
  expect(res2.statusCode).toBe(200);

  const state2 = await pool.query(
    "select consecutive_failures, next_allowed_at from instance_probe_states where instance_id = $1 and probe_kind = $2",
    [instanceId, "gateway"],
  );
  expect(state2.rows[0].consecutive_failures).toBe(0);
  expect(state2.rows[0].next_allowed_at).toBeNull();
});
