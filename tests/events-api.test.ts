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

test("GET /v1/events supports pagination with stable ordering", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  await pool.query(
    "insert into events (event_type, ts, payload, labels_snapshot) values ($1,$2,$3,$4), ($5,$6,$7,$8), ($9,$10,$11,$12)",
    [
      "exec.queued",
      "2026-03-19T00:00:01.000Z",
      { seq: 1 },
      {},
      "exec.started",
      "2026-03-19T00:00:02.000Z",
      { seq: 2 },
      {},
      "exec.finished",
      "2026-03-19T00:00:03.000Z",
      { seq: 3 },
      {},
    ],
  );
  const app = await buildServer({ pool });

  const res = await app.inject({
    method: "GET",
    url: "/v1/events?page=2&page_size=1",
  });

  expect(res.statusCode).toBe(200);
  expect(res.json()).toMatchObject({
    total: 3,
    page: 2,
    page_size: 1,
  });
  expect(res.json().items).toHaveLength(1);
  expect(res.json().items[0].event_type).toBe("exec.started");
});

test("GET /v1/events supports task_id filtering", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  await pool.query(
    "insert into events (event_type, payload, labels_snapshot) values ($1,$2,$3), ($4,$5,$6)",
    [
      "exec.finished",
      { task_id: "11111111-1111-1111-1111-111111111111", action: "agent.run" },
      {},
      "exec.finished",
      { task_id: "22222222-2222-2222-2222-222222222222", action: "agent.run" },
      {},
    ],
  );
  const app = await buildServer({ pool });

  const res = await app.inject({
    method: "GET",
    url: "/v1/events?task_id=11111111-1111-1111-1111-111111111111",
  });

  expect(res.statusCode).toBe(200);
  expect(res.json().items).toHaveLength(1);
  expect(res.json().items[0].payload.task_id).toBe("11111111-1111-1111-1111-111111111111");
});

test("GET /v1/events includes instance_display_name when current instance has a remark", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  const instance = await pool.query(
    "insert into instances (name, display_name) values ($1, $2) returning id",
    ["iZ2ze1f788nwbjasqed9acZ", "北京控制面"],
  );
  await pool.query(
    "insert into events (event_type, instance_id, instance_name, payload, labels_snapshot) values ($1, $2, $3, $4, $5)",
    [
      "exec.finished",
      instance.rows[0].id,
      "iZ2ze1f788nwbjasqed9acZ",
      { action: "skills.status", status: "ok" },
      {},
    ],
  );
  const app = await buildServer({ pool });

  const res = await app.inject({ method: "GET", url: "/v1/events" });

  expect(res.statusCode).toBe(200);
  expect(res.json().items[0]).toMatchObject({
    instance_id: instance.rows[0].id,
    instance_name: "iZ2ze1f788nwbjasqed9acZ",
    instance_display_name: "北京控制面",
  });
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
