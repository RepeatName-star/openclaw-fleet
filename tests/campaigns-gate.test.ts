import { initTestDb, runMigrations, createTestPool } from "./support/db.js";
import { reconcileOpenCampaignsOnce } from "../src/campaigns/reconciler.js";

test("campaign blocks and schedules probe when gateway fact stale", async () => {
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

  await reconcileOpenCampaignsOnce(pool, {
    getOnline: async () => true,
  } as any);

  const cis = await pool.query("select state, blocked_reason from campaign_instances");
  expect(cis.rows[0].state).toBe("blocked");
  expect(String(cis.rows[0].blocked_reason)).toMatch(/gateway/i);

  const probeTasks = await pool.query(
    "select action from tasks where target_type='instance' and target_id=$1",
    [i1.rows[0].id],
  );
  expect(probeTasks.rows.map((r) => r.action)).toContain("fleet.gateway.probe");
});

test("agent.run campaign is not blocked solely by missing skills snapshot", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  const i1 = await pool.query(
    "insert into instances (name, gateway_reachable, gateway_reachable_at) values ('i1', true, now()) returning id",
  );
  await pool.query(
    "insert into instance_labels (instance_id, key, value, source) values ($1,$2,$3,$4)",
    [i1.rows[0].id, "biz.openclaw.io/team", "a", "business"],
  );
  await pool.query(
    "insert into campaigns (name, selector, action, payload, gate) values ($1,$2,$3,$4,$5)",
    ["c1", "biz.openclaw.io/team=a", "agent.run", { message: "hi" }, {}],
  );

  await reconcileOpenCampaignsOnce(pool, {
    getOnline: async () => true,
  } as any);

  const cis = await pool.query("select state, blocked_reason from campaign_instances");
  expect(cis.rows[0].state).toBe("queued");
  expect(cis.rows[0].blocked_reason).toBeNull();
});

test("fleet.gateway.probe campaign can queue without prior gateway facts", async () => {
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
    ["c1", "biz.openclaw.io/team=a", "fleet.gateway.probe", {}, { minVersion: "2026.2.26" }],
  );

  await reconcileOpenCampaignsOnce(pool, {
    getOnline: async () => true,
  } as any);

  const queued = await pool.query("select action from tasks where target_type='instance' and target_id=$1", [i1.rows[0].id]);
  expect(queued.rows).toHaveLength(1);
  expect(queued.rows[0].action).toBe("fleet.gateway.probe");
});
