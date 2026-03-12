import { buildServer } from "../src/server.js";
import { createTestPool, initTestDb, runMigrations } from "./support/db.js";

test("POST /v1/instances/:id/labels upserts a business label", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  const created = await pool.query("insert into instances (name) values ('i-1') returning id");
  const app = await buildServer({ pool, redis: { set: async () => "OK", get: async () => null } });

  const res = await app.inject({
    method: "POST",
    url: `/v1/instances/${created.rows[0].id}/labels`,
    payload: { key: "biz.openclaw.io/team", value: "a" },
  });
  expect(res.statusCode).toBe(200);

  const list = await app.inject({
    method: "GET",
    url: `/v1/instances/${created.rows[0].id}/labels`,
  });
  expect(list.statusCode).toBe(200);
  expect(list.json().items).toEqual(
    expect.arrayContaining([expect.objectContaining({ key: "biz.openclaw.io/team", value: "a" })]),
  );
});

test("POST /v1/instances/:id/labels rejects system prefix", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  const created = await pool.query("insert into instances (name) values ('i-1') returning id");
  const app = await buildServer({ pool, redis: { set: async () => "OK", get: async () => null } });

  const res = await app.inject({
    method: "POST",
    url: `/v1/instances/${created.rows[0].id}/labels`,
    payload: { key: "openclaw.io/os", value: "linux" },
  });
  expect(res.statusCode).toBe(400);
});

