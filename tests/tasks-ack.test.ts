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
