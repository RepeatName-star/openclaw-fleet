import { buildServer } from "../src/server.js";
import { createTestPool, initTestDb, runMigrations } from "./support/db.js";

const redis = { set: async () => "OK", get: async () => null };

test("POST /v1/groups creates a group with selector", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  const app = await buildServer({ pool, redis });

  const res = await app.inject({
    method: "POST",
    url: "/v1/groups",
    payload: { name: "g1", selector: "biz.openclaw.io/team=a" },
  });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toHaveProperty("id");
});

