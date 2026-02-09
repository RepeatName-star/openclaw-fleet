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
