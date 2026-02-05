import { initTestDb, runMigrations } from "./support/db.js";

test("migrations create core tables", async () => {
  const db = initTestDb();
  await runMigrations(db);
  expect(() => db.public.query("select 1 from instances")).not.toThrow();
});
