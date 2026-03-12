import { buildServer } from "../src/server.js";
import { createTestPool, initTestDb, runMigrations } from "./support/db.js";

const redis = { set: async () => "OK", get: async () => null };

test("POST /v1/campaigns creates an open campaign", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  const app = await buildServer({ pool, redis });

  const res = await app.inject({
    method: "POST",
    url: "/v1/campaigns",
    payload: {
      name: "c1",
      selector: "biz.openclaw.io/team=a",
      action: "skills.status",
      payload: {},
    },
  });
  expect(res.statusCode).toBe(200);
  const body = res.json();
  expect(body.status).toBe("open");
  expect(body.generation).toBe(1);
  expect(body).toHaveProperty("id");
});

test("GET /v1/campaigns lists campaigns", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  await pool.query(
    "insert into campaigns (name, selector, action, payload) values ($1,$2,$3,$4)",
    ["c1", "biz.openclaw.io/team=a", "skills.status", {}],
  );
  const app = await buildServer({ pool, redis });

  const res = await app.inject({ method: "GET", url: "/v1/campaigns" });
  expect(res.statusCode).toBe(200);
  expect(res.json().items).toHaveLength(1);
  expect(res.json().items[0].name).toBe("c1");
});

test("POST /v1/campaigns/:id/close closes a campaign", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  const created = await pool.query(
    "insert into campaigns (name, selector, action, payload) values ($1,$2,$3,$4) returning id",
    ["c1", "biz.openclaw.io/team=a", "skills.status", {}],
  );
  const app = await buildServer({ pool, redis });

  const res = await app.inject({
    method: "POST",
    url: `/v1/campaigns/${created.rows[0].id}/close`,
  });
  expect(res.statusCode).toBe(200);

  const row = await pool.query("select status, closed_at from campaigns where id = $1", [
    created.rows[0].id,
  ]);
  expect(row.rows[0].status).toBe("closed");
  expect(row.rows[0].closed_at).toBeTruthy();
});

