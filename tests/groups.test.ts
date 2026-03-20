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

test("GET /v1/groups supports q and pagination", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  await pool.query(
    "insert into groups (name, selector, description) values ($1, $2, $3), ($4, $5, $6), ($7, $8, $9)",
    [
      "workers-a",
      "biz.openclaw.io/team=a",
      "group a",
      "workers-b",
      "biz.openclaw.io/team=b",
      "group b",
      "control-plane",
      "biz.openclaw.io/master=true",
      "control",
    ],
  );
  const app = await buildServer({ pool, redis });

  const res = await app.inject({
    method: "GET",
    url: "/v1/groups?q=workers&page=2&page_size=1",
  });

  expect(res.statusCode).toBe(200);
  expect(res.json()).toMatchObject({
    total: 2,
    page: 2,
    page_size: 1,
  });
  expect(res.json().items).toHaveLength(1);
  expect(res.json().items[0].name).toBe("workers-b");
});

test("GET /v1/groups/:id/matches includes display_name for matched instances", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  const group = await pool.query(
    "insert into groups (name, selector) values ($1, $2) returning id",
    ["openclaw", "biz.openclaw.io/openclaw=true"],
  );
  const instance = await pool.query(
    "insert into instances (name, display_name) values ($1, $2) returning id",
    ["iZ2ze1f788nwbjasqed9acZ", "北京控制面"],
  );
  await pool.query(
    "insert into instance_labels (instance_id, key, value, source) values ($1, $2, $3, $4)",
    [instance.rows[0].id, "biz.openclaw.io/openclaw", "true", "business"],
  );
  const app = await buildServer({ pool, redis });

  const res = await app.inject({
    method: "GET",
    url: `/v1/groups/${group.rows[0].id}/matches`,
  });

  expect(res.statusCode).toBe(200);
  expect(res.json().items).toEqual([
    {
      id: instance.rows[0].id,
      name: "iZ2ze1f788nwbjasqed9acZ",
      display_name: "北京控制面",
    },
  ]);
});
