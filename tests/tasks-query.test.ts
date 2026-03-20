import { buildServer } from "../src/server.js";
import { createTestPool, initTestDb, runMigrations } from "./support/db.js";

test("GET /v1/tasks supports pagination and task filters", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  await pool.query(
    "insert into instances (id, name, display_name) values ($1, $2, $3)",
    ["00000000-0000-0000-0000-000000000101", "host-a", "control-a"],
  );
  await pool.query(
    "insert into tasks (target_type, target_id, action, task_name, status) values ($1, $2, $3, $4, $5)",
    ["instance", "00000000-0000-0000-0000-000000000101", "agent.run", "restart gateway", "pending"],
  );
  await pool.query(
    "insert into tasks (target_type, target_id, action, task_name, status) values ($1, $2, $3, $4, $5)",
    ["instance", "00000000-0000-0000-0000-000000000101", "agent.run", "restart worker", "pending"],
  );
  await pool.query(
    "insert into tasks (target_type, target_id, action, task_name, status) values ($1, $2, $3, $4, $5)",
    ["instance", "00000000-0000-0000-0000-000000000101", "skills.status", "inventory skills", "done"],
  );
  const app = await buildServer({ pool });
  const res = await app.inject({
    method: "GET",
    url: "/v1/tasks?q=restart&action=agent.run&status=pending&page=1&page_size=1",
  });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toMatchObject({
    total: 2,
    page: 1,
    page_size: 1,
  });
  expect(res.json().items).toHaveLength(1);
  expect(res.json().items[0]).toMatchObject({
    action: "agent.run",
    task_name: "restart worker",
    instance_display_name: "control-a",
  });
});

test("GET /v1/tasks filters by task origin", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  await pool.query(
    "insert into instances (id, name, display_name) values ($1, $2, $3)",
    ["00000000-0000-0000-0000-000000000111", "host-origin", "origin-control"],
  );
  await pool.query(
    "insert into tasks (target_type, target_id, action, task_name, status, task_origin) values ($1, $2, $3, $4, $5, $6)",
    ["instance", "00000000-0000-0000-0000-000000000111", "skills.status", "manual task", "done", "manual"],
  );
  await pool.query(
    "insert into tasks (target_type, target_id, action, task_name, status, task_origin) values ($1, $2, $3, $4, $5, $6)",
    ["instance", "00000000-0000-0000-0000-000000000111", "agents.files.get", "system task", "done", "system"],
  );

  const app = await buildServer({ pool });
  const res = await app.inject({
    method: "GET",
    url: "/v1/tasks?task_origin=manual&page=1&page_size=10",
  });

  expect(res.statusCode).toBe(200);
  expect(res.json()).toMatchObject({
    total: 1,
    page: 1,
    page_size: 10,
  });
  expect(res.json().items).toHaveLength(1);
  expect(res.json().items[0]).toMatchObject({
    task_name: "manual task",
    task_origin: "manual",
  });
});

test("GET /v1/tasks search matches instance display name", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  await pool.query(
    "insert into instances (id, name, display_name) values ($1, $2, $3)",
    ["00000000-0000-0000-0000-000000000102", "host-b", "beijing-master"],
  );
  await pool.query(
    "insert into tasks (target_type, target_id, action, task_name, status) values ($1, $2, $3, $4, $5)",
    ["instance", "00000000-0000-0000-0000-000000000102", "agent.run", "daily audit", "pending"],
  );

  const app = await buildServer({ pool });
  const res = await app.inject({
    method: "GET",
    url: "/v1/tasks?q=beijing-master&page=1&page_size=10",
  });

  expect(res.statusCode).toBe(200);
  expect(res.json()).toMatchObject({
    total: 1,
    page: 1,
    page_size: 10,
  });
  expect(res.json().items[0]).toMatchObject({
    task_name: "daily audit",
    instance_name: "host-b",
    instance_display_name: "beijing-master",
  });
});

test("GET /v1/tasks/:id/attempts returns attempts", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  const task = await pool.query(
    "insert into tasks (target_type, target_id, action) values ('instance','i-1','agent.run') returning id",
  );
  await pool.query(
    "insert into task_attempts (task_id, attempt, status, error) values ($1, 1, 'error', 'boom')",
    [task.rows[0].id],
  );
  const app = await buildServer({ pool });
  const res = await app.inject({
    method: "GET",
    url: `/v1/tasks/${task.rows[0].id}/attempts`,
  });
  expect(res.statusCode).toBe(200);
  expect(res.json().items[0].error).toBe("boom");
});
