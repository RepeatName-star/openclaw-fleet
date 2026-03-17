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

test("POST /v1/groups/:id/delete deletes a group via browser-safe alias", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  const created = await pool.query(
    "insert into groups (name, selector) values ($1, $2) returning id",
    ["g1", "biz.openclaw.io/team=a"],
  );
  const app = await buildServer({ pool, redis });

  const res = await app.inject({
    method: "POST",
    url: `/v1/groups/${created.rows[0].id}/delete`,
  });

  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ ok: true });
});
