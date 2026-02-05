import { initTestDb, runMigrations } from "./support/db";

test("migrations create core tables", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const res = db.public.query("SELECT to_regclass('instances') as t");
  expect(res.rows[0].t).toBe("instances");
});
