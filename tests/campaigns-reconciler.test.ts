import { initTestDb, runMigrations, createTestPool } from "./support/db.js";
import { reconcileOpenCampaignsOnce } from "../src/campaigns/reconciler.js";

test("reconciler schedules one instance-targeted task per matching instance", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);

  const i1 = await pool.query("insert into instances (name) values ('i1') returning id");
  const i2 = await pool.query("insert into instances (name) values ('i2') returning id");
  await pool.query(
    "insert into instance_labels (instance_id, key, value, source) values ($1,$2,$3,$4)",
    [i1.rows[0].id, "biz.openclaw.io/team", "a", "business"],
  );
  await pool.query(
    "insert into instance_labels (instance_id, key, value, source) values ($1,$2,$3,$4)",
    [i2.rows[0].id, "biz.openclaw.io/team", "b", "business"],
  );
  const c = await pool.query(
    "insert into campaigns (name, selector, action, payload) values ($1,$2,$3,$4) returning id, generation",
    ["c1", "biz.openclaw.io/team=a", "skills.status", {}],
  );

  const now = new Date();
  await pool.query(
    "update instances set gateway_reachable = true, gateway_reachable_at = $2, openclaw_version = $3, openclaw_version_at = $2, skills_snapshot_at = $2 where id = $1",
    [i1.rows[0].id, now, "2026.2.26"],
  );

  await reconcileOpenCampaignsOnce(pool, { getOnline: async () => true } as any);

  const tasks = await pool.query(
    "select target_type, target_id, action from tasks order by created_at asc",
  );
  expect(tasks.rows).toHaveLength(1);
  expect(tasks.rows[0].target_type).toBe("instance");
  expect(tasks.rows[0].target_id).toBe(i1.rows[0].id);
  expect(tasks.rows[0].action).toBe("skills.status");

  const cis = await pool.query(
    "select campaign_id, generation, instance_id, state, task_id from campaign_instances",
  );
  expect(cis.rows).toHaveLength(1);
  expect(cis.rows[0].campaign_id).toBe(c.rows[0].id);
  expect(cis.rows[0].generation).toBe(c.rows[0].generation);
  expect(cis.rows[0].instance_id).toBe(i1.rows[0].id);
  expect(cis.rows[0].state).toBe("queued");
  expect(cis.rows[0].task_id).toBeTruthy();
});

test("reconciler is idempotent for the same (campaign,generation,instance)", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  const i1 = await pool.query("insert into instances (name) values ('i1') returning id");
  await pool.query(
    "insert into instance_labels (instance_id, key, value, source) values ($1,$2,$3,$4)",
    [i1.rows[0].id, "biz.openclaw.io/team", "a", "business"],
  );
  await pool.query(
    "insert into campaigns (name, selector, action, payload) values ($1,$2,$3,$4)",
    ["c1", "biz.openclaw.io/team=a", "skills.status", {}],
  );

  await reconcileOpenCampaignsOnce(pool);
  await reconcileOpenCampaignsOnce(pool);

  const tasks = await pool.query("select id from tasks");
  expect(tasks.rows).toHaveLength(1);
});

test("reconciler marks target as removed if instance leaves selector scope; re-enter does not re-exec", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  const i1 = await pool.query("insert into instances (name) values ('i1') returning id");
  await pool.query(
    "insert into instance_labels (instance_id, key, value, source) values ($1,$2,$3,$4)",
    [i1.rows[0].id, "biz.openclaw.io/team", "a", "business"],
  );
  await pool.query(
    "insert into campaigns (name, selector, action, payload) values ($1,$2,$3,$4)",
    ["c1", "biz.openclaw.io/team=a", "skills.status", {}],
  );

  await reconcileOpenCampaignsOnce(pool);

  // Leave scope
  await pool.query("delete from instance_labels where instance_id = $1 and key = $2", [
    i1.rows[0].id,
    "biz.openclaw.io/team",
  ]);
  await reconcileOpenCampaignsOnce(pool);

  const state1 = await pool.query("select state from campaign_instances where instance_id = $1", [
    i1.rows[0].id,
  ]);
  expect(state1.rows[0].state).toBe("removed");

  // Re-enter scope
  await pool.query(
    "insert into instance_labels (instance_id, key, value, source) values ($1,$2,$3,$4)",
    [i1.rows[0].id, "biz.openclaw.io/team", "a", "business"],
  );
  await reconcileOpenCampaignsOnce(pool);

  const tasks = await pool.query("select id from tasks");
  expect(tasks.rows).toHaveLength(1);
});

test("reconciler redacts config patch raw in exec.queued events", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);

  const instance = await pool.query("insert into instances (name) values ('i1') returning id");
  const instanceId = String(instance.rows[0].id);
  await pool.query(
    "insert into instance_labels (instance_id, key, value, source) values ($1,$2,$3,$4)",
    [instanceId, "biz.openclaw.io/team", "a", "business"],
  );
  const now = new Date();
  await pool.query(
    "update instances set gateway_reachable = true, gateway_reachable_at = $2 where id = $1",
    [instanceId, now],
  );
  await pool.query(
    "insert into campaigns (name, selector, action, payload) values ($1,$2,$3,$4)",
    [
      "c1",
      "biz.openclaw.io/team=a",
      "fleet.config_patch",
      { raw: "{\"models\":{\"default\":\"zai/glm-5-turbo\"}}", note: "switch model" },
    ],
  );

  await reconcileOpenCampaignsOnce(pool, { getOnline: async () => true });

  const events = await pool.query(
    "select event_type, payload, artifact_id from events where event_type = 'exec.queued'",
  );
  expect(events.rowCount).toBe(1);
  expect(events.rows[0].payload.payload.raw).toMatch(/\[sha256:/);

  const artifacts = await pool.query("select content from artifacts where id = $1", [
    events.rows[0].artifact_id,
  ]);
  expect(artifacts.rowCount).toBe(1);
  expect(artifacts.rows[0].content.payload.raw).toBe(
    "{\"models\":{\"default\":\"zai/glm-5-turbo\"}}",
  );
});
