import { buildServer } from "../src/server.js";
import { createTestPool, initTestDb, runMigrations } from "./support/db.js";

test("POST /v1/tasks creates a task", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);

  const app = await buildServer({ pool });
  const res = await app.inject({
    method: "POST",
    url: "/v1/tasks",
    payload: {
      target_type: "group",
      target_id: "g1",
      action: "skills.update",
      payload: {},
    },
  });
  expect(res.statusCode).toBe(200);
});
