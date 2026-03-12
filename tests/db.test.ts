import { initTestDb, runMigrations } from "./support/db.js";

test("migrations create core tables", async () => {
  const db = initTestDb();
  await runMigrations(db);
  expect(() => db.public.query("select 1 from instances")).not.toThrow();
});

test("migrations add instance/task metadata columns", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const instanceColumns = db.public.query(
    "select column_name from information_schema.columns where table_name='instances'",
  );
  const names = instanceColumns.rows.map((row) => row.column_name);
  expect(names).toContain("control_ui_url");
  expect(names).toContain("skills_snapshot");
  expect(names).toContain("skills_snapshot_at");
  const taskColumns = db.public.query(
    "select column_name from information_schema.columns where table_name='tasks'",
  );
  const taskNames = taskColumns.rows.map((row) => row.column_name);
  expect(taskNames).toContain("result");
});

test("bulk management migrations add v0.1 tables and columns", async () => {
  const db = initTestDb();
  await runMigrations(db);

  expect(() => db.public.query("select 1 from instance_labels")).not.toThrow();
  expect(() => db.public.query("select 1 from campaigns")).not.toThrow();
  expect(() => db.public.query("select 1 from campaign_instances")).not.toThrow();
  expect(() => db.public.query("select 1 from events")).not.toThrow();
  expect(() => db.public.query("select 1 from artifacts")).not.toThrow();
  expect(() => db.public.query("select 1 from skill_bundles")).not.toThrow();

  const instanceColumns = db.public.query(
    "select column_name from information_schema.columns where table_name='instances'",
  );
  const instanceNames = instanceColumns.rows.map((row) => row.column_name);
  expect(instanceNames).toContain("gateway_reachable");
  expect(instanceNames).toContain("gateway_reachable_at");
  expect(instanceNames).toContain("openclaw_version");
  expect(instanceNames).toContain("openclaw_version_at");
  expect(instanceNames).toContain("skills_snapshot_invalidated_at");

  const groupColumns = db.public.query(
    "select column_name from information_schema.columns where table_name='groups'",
  );
  const groupNames = groupColumns.rows.map((row) => row.column_name);
  expect(groupNames).toContain("selector");
  expect(groupNames).toContain("description");
  expect(groupNames).toContain("updated_at");
});
