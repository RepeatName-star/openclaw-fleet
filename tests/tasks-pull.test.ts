import { buildServer } from "../src/server.js";
import { issueDeviceToken } from "../src/auth.js";
import { createTestPool, initTestDb, runMigrations } from "./support/db.js";

test("POST /v1/tasks/pull returns pending tasks", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);

  const created = await pool.query(
    "insert into instances (name) values ($1) returning id",
    ["i-1"],
  );
  const instanceId = created.rows[0].id as string;
  const token = await issueDeviceToken(pool, { instanceId, scopes: ["operator.admin"] });

  await pool.query(
    "insert into tasks (target_type, target_id, action, payload) values ($1, $2, $3, $4)",
    ["instance", instanceId, "skills.update", {}],
  );

  const redis = {
    set: async () => "OK",
  };

  const app = await buildServer({ pool, redis });
  const res = await app.inject({
    method: "POST",
    url: "/v1/tasks/pull",
    headers: { authorization: `Bearer ${token}` },
    payload: { limit: 5 },
  });
  expect(res.statusCode).toBe(200);
  const body = res.json();
  expect(body.tasks).toHaveLength(1);
  expect(body.tasks[0].action).toBe("skills.update");
});
