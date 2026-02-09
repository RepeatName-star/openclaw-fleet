import { buildServer } from "../src/server.js";
import { createTestPool, initTestDb, runMigrations } from "./support/db.js";

test("GET /v1/tasks returns list", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  await pool.query(
    "insert into tasks (target_type, target_id, action) values ('instance','i-1','agent.run')",
  );
  const app = await buildServer({ pool });
  const res = await app.inject({ method: "GET", url: "/v1/tasks" });
  expect(res.statusCode).toBe(200);
  expect(res.json().items[0].action).toBe("agent.run");
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
