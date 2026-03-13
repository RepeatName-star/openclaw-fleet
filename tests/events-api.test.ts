import { buildServer } from "../src/server.js";
import { initTestDb, runMigrations, createTestPool } from "./support/db.js";

test("GET /v1/events lists events", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  await pool.query(
    "insert into events (event_type, payload, labels_snapshot) values ($1,$2,$3)",
    ["exec.queued", { x: 1 }, {}],
  );
  const app = await buildServer({ pool });

  const res = await app.inject({ method: "GET", url: "/v1/events" });
  expect(res.statusCode).toBe(200);
  expect(res.json().items[0].event_type).toBe("exec.queued");
});

test("GET /v1/events/export returns JSONL", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  await pool.query(
    "insert into events (event_type, payload, labels_snapshot) values ($1,$2,$3)",
    ["exec.queued", { x: 1 }, {}],
  );
  const app = await buildServer({ pool });

  const res = await app.inject({ method: "GET", url: "/v1/events/export?format=jsonl" });
  expect(res.statusCode).toBe(200);
  expect(res.headers["content-type"]).toMatch(/json/i);
  expect(res.body.trim().split("\n").length).toBe(1);
});

