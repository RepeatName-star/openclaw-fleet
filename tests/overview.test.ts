import { buildServer } from "../src/server.js";
import { createTestPool, initTestDb, runMigrations } from "./support/db.js";

test("GET /v1/overview returns operator summary counts", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);

  const created = await pool.query(
    "insert into instances (name) values ($1), ($2) returning id",
    ["i-1", "i-2"],
  );
  const onlineId = String(created.rows[0].id);
  await pool.query(
    "insert into tasks (target_type, target_id, action, status) values ($1, $2, $3, $4), ($5, $6, $7, $8), ($9, $10, $11, $12), ($13, $14, $15, $16)",
    [
      "instance",
      onlineId,
      "agent.run",
      "pending",
      "instance",
      onlineId,
      "skills.status",
      "leased",
      "instance",
      onlineId,
      "skills.status",
      "done",
      "instance",
      onlineId,
      "skills.status",
      "error",
    ],
  );
  await pool.query(
    "insert into campaigns (name, selector, action, payload, status) values ($1, $2, $3, $4, $5), ($6, $7, $8, $9, $10)",
    [
      "open rollout",
      "biz.openclaw.io/team=a",
      "skills.status",
      {},
      "open",
      "closed rollout",
      "biz.openclaw.io/team=b",
      "skills.status",
      {},
      "closed",
    ],
  );
  await pool.query(
    "insert into skill_bundles (name, format, sha256, size_bytes, content) values ($1, $2, $3, $4, $5), ($6, $7, $8, $9, $10)",
    [
      "bundle-a",
      "tar.gz",
      "sha-a",
      1,
      Buffer.from("a"),
      "bundle-b",
      "tar.gz",
      "sha-b",
      1,
      Buffer.from("b"),
    ],
  );

  const redis = {
    set: async () => "OK",
    get: async (key: string) => (key === `hb:${onlineId}` ? "1" : null),
  };
  const app = await buildServer({ pool, redis });

  const res = await app.inject({ method: "GET", url: "/v1/overview" });

  expect(res.statusCode).toBe(200);
  expect(res.json()).toMatchObject({
    instances_total: 2,
    instances_online: 1,
    tasks_total: 4,
    tasks_pending: 1,
    tasks_leased: 1,
    tasks_done: 1,
    tasks_error: 1,
    campaigns_open: 1,
    skill_bundles_total: 2,
  });
});
