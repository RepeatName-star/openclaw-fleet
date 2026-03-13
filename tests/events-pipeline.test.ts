import { initTestDb, runMigrations, createTestPool } from "./support/db.js";
import { issueDeviceToken } from "../src/auth.js";
import { reconcileOpenCampaignsOnce } from "../src/campaigns/reconciler.js";
import { ensureProbeTaskScheduled } from "../src/probe/scheduler.js";
import { buildServer } from "../src/server.js";

test("campaign reconcile emits target.added and exec.queued events", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);

  const i1 = await pool.query("insert into instances (name) values ('i1') returning id");
  await pool.query(
    "insert into instance_labels (instance_id, key, value, source) values ($1,$2,$3,$4)",
    [i1.rows[0].id, "biz.openclaw.io/team", "a", "business"],
  );
  await pool.query(
    "insert into campaigns (name, selector, action, payload, gate) values ($1,$2,$3,$4,$5)",
    ["c1", "biz.openclaw.io/team=a", "skills.status", {}, { minVersion: "2026.2.26" }],
  );

  const now = new Date();
  await pool.query(
    "update instances set gateway_reachable=true, gateway_reachable_at=$2, openclaw_version=$3, openclaw_version_at=$2, skills_snapshot_at=$2 where id=$1",
    [i1.rows[0].id, now, "2026.2.26"],
  );

  await reconcileOpenCampaignsOnce(pool, { getOnline: async () => true } as any);

  const events = await pool.query("select event_type from events order by ts asc");
  const types = events.rows.map((r) => r.event_type);
  expect(types).toEqual(expect.arrayContaining(["target.added", "exec.queued"]));
});

test("tasks pull emits exec.started for campaign-linked task", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);

  const i1 = await pool.query("insert into instances (name) values ('i1') returning id");
  const instanceId = String(i1.rows[0].id);
  const token = await issueDeviceToken(pool, { instanceId, scopes: ["operator.admin"] });
  const c1 = await pool.query(
    "insert into campaigns (name, selector, action, payload) values ($1,$2,$3,$4) returning id, generation",
    ["c1", "biz.openclaw.io/team=a", "skills.status", {}],
  );
  const t1 = await pool.query(
    "insert into tasks (target_type, target_id, action, payload) values ($1,$2,$3,$4) returning id",
    ["instance", instanceId, "skills.update", {}],
  );
  await pool.query(
    "insert into campaign_instances (campaign_id, generation, instance_id, state, task_id) values ($1,$2,$3,$4,$5)",
    [c1.rows[0].id, c1.rows[0].generation, instanceId, "queued", t1.rows[0].id],
  );

  const redis = { set: async () => "OK" };
  const app = await buildServer({ pool, redis });
  const res = await app.inject({
    method: "POST",
    url: "/v1/tasks/pull",
    headers: { authorization: `Bearer ${token}` },
    payload: { limit: 5 },
  });
  expect(res.statusCode).toBe(200);

  const events = await pool.query(
    "select event_type, campaign_id, campaign_generation from events where event_type = $1",
    ["exec.started"],
  );
  expect(events.rowCount).toBe(1);
  expect(events.rows[0].campaign_id).toBe(c1.rows[0].id);
  expect(events.rows[0].campaign_generation).toBe(c1.rows[0].generation);
});

test("tasks ack emits exec.finished and stores raw result artifact", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);

  const i1 = await pool.query("insert into instances (name) values ('i1') returning id");
  const instanceId = String(i1.rows[0].id);
  const token = await issueDeviceToken(pool, { instanceId, scopes: ["operator.admin"] });
  const c1 = await pool.query(
    "insert into campaigns (name, selector, action, payload) values ($1,$2,$3,$4) returning id, generation",
    ["c1", "biz.openclaw.io/team=a", "skills.status", {}],
  );
  const t1 = await pool.query(
    "insert into tasks (target_type, target_id, action, payload) values ($1,$2,$3,$4) returning id",
    ["instance", instanceId, "skills.update", {}],
  );
  await pool.query(
    "insert into campaign_instances (campaign_id, generation, instance_id, state, task_id) values ($1,$2,$3,$4,$5)",
    [c1.rows[0].id, c1.rows[0].generation, instanceId, "queued", t1.rows[0].id],
  );

  const app = await buildServer({ pool });
  const res = await app.inject({
    method: "POST",
    url: "/v1/tasks/ack",
    headers: { authorization: `Bearer ${token}` },
    payload: { task_id: String(t1.rows[0].id), status: "ok", result: { ok: true } },
  });
  expect(res.statusCode).toBe(200);

  const events = await pool.query(
    "select event_type, artifact_id from events where event_type = $1",
    ["exec.finished"],
  );
  expect(events.rowCount).toBe(1);
  expect(events.rows[0].artifact_id).toBeTruthy();

  const artifacts = await pool.query("select kind from artifacts where id = $1", [events.rows[0].artifact_id]);
  expect(artifacts.rowCount).toBe(1);
  expect(artifacts.rows[0].kind).toBe("task.result");
});

test("probe scheduler emits probe.requested event when scheduling a probe task", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);

  const i1 = await pool.query("insert into instances (name) values ('i1') returning id");
  const instanceId = String(i1.rows[0].id);

  await ensureProbeTaskScheduled(pool, instanceId, "gateway");

  const tasks = await pool.query("select action from tasks");
  expect(tasks.rowCount).toBe(1);
  expect(tasks.rows[0].action).toBe("fleet.gateway.probe");

  const events = await pool.query("select event_type from events");
  expect(events.rows.map((r) => r.event_type)).toEqual(expect.arrayContaining(["probe.requested"]));
});

test("probe pull + ack emits probe.started and probe.finished", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);

  const i1 = await pool.query("insert into instances (name) values ('i1') returning id");
  const instanceId = String(i1.rows[0].id);
  const token = await issueDeviceToken(pool, { instanceId, scopes: ["operator.admin"] });
  const t1 = await pool.query(
    "insert into tasks (target_type, target_id, action, payload) values ($1,$2,$3,$4) returning id",
    ["instance", instanceId, "fleet.gateway.probe", {}],
  );

  const redis = { set: async () => "OK" };
  const app = await buildServer({ pool, redis });
  const pull = await app.inject({
    method: "POST",
    url: "/v1/tasks/pull",
    headers: { authorization: `Bearer ${token}` },
    payload: { limit: 5 },
  });
  expect(pull.statusCode).toBe(200);

  const ack = await app.inject({
    method: "POST",
    url: "/v1/tasks/ack",
    headers: { authorization: `Bearer ${token}` },
    payload: { task_id: String(t1.rows[0].id), status: "ok", result: { gateway_reachable: true } },
  });
  expect(ack.statusCode).toBe(200);

  const events = await pool.query("select event_type from events order by ts asc");
  const types = events.rows.map((r) => r.event_type);
  expect(types).toEqual(expect.arrayContaining(["probe.started", "probe.finished"]));
});
