import { buildServer } from "../src/server.js";
import { createTestPool, initTestDb, runMigrations } from "./support/db.js";

test("GET /v1/instances returns list with online=false", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  await pool.query("insert into instances (name) values ('i-1')");
  const redis = { set: async () => "OK", get: async () => null };
  const app = await buildServer({ pool, redis });
  const res = await app.inject({ method: "GET", url: "/v1/instances" });
  expect(res.statusCode).toBe(200);
  const data = res.json();
  expect(data.items[0]).toMatchObject({ name: "i-1", online: false });
});

test("PATCH /v1/instances/:id updates control_ui_url", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  const created = await pool.query("insert into instances (name) values ('i-1') returning id");
  const redis = { set: async () => "OK", get: async () => null };
  const app = await buildServer({ pool, redis });
  const res = await app.inject({
    method: "PATCH",
    url: `/v1/instances/${created.rows[0].id}`,
    payload: { control_ui_url: "http://localhost:18789" },
  });
  expect(res.statusCode).toBe(200);
  expect(res.json().control_ui_url).toBe("http://localhost:18789");
});

test("GET /v1/instances/:id/skills returns snapshot", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  const created = await pool.query(
    "insert into instances (name, skills_snapshot) values ($1, $2) returning id",
    ["i-1", { skills: [{ skillKey: "weather" }] }],
  );
  const redis = { set: async () => "OK", get: async () => null };
  const app = await buildServer({ pool, redis });
  const res = await app.inject({
    method: "GET",
    url: `/v1/instances/${created.rows[0].id}/skills`,
  });
  expect(res.statusCode).toBe(200);
  expect(res.json().skills.skills[0].skillKey).toBe("weather");
});
