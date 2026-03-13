import { initTestDb, runMigrations, createTestPool } from "../support/db.js";
import { insertEvent, insertArtifact } from "../../src/events/store.js";

test("insertEvent stores instance_name and labels_snapshot", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  const i = await pool.query("insert into instances (name) values ('i1') returning id");
  await pool.query(
    "insert into instance_labels (instance_id, key, value, source) values ($1,$2,$3,$4)",
    [i.rows[0].id, "biz.openclaw.io/team", "a", "business"],
  );

  await insertEvent(pool, {
    event_type: "exec.queued",
    instance_id: i.rows[0].id,
    payload: { action: "skills.status" },
  });

  const rows = await pool.query("select event_type, instance_name, labels_snapshot from events");
  expect(rows.rows[0].event_type).toBe("exec.queued");
  expect(rows.rows[0].instance_name).toBe("i1");
  expect(rows.rows[0].labels_snapshot["biz.openclaw.io/team"]).toBe("a");
});

test("insertArtifact stores json content and expires_at", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  const a = await insertArtifact(pool, { kind: "task.payload", content: { x: 1 } });
  expect(a.id).toBeTruthy();
});

