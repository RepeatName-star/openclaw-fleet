import { buildServer } from "../src/server.js";
import { initTestDb, runMigrations, createTestPool } from "./support/db.js";

function b64(s: string) {
  return Buffer.from(s, "utf-8").toString("base64");
}

test("POST /v1/skill-bundles uploads a tar.gz bundle (base64)", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  const app = await buildServer({ pool });

  const res = await app.inject({
    method: "POST",
    url: "/v1/skill-bundles",
    payload: { name: "demo-skill", format: "tar.gz", content_base64: b64("fake-tar.gz") },
  });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toHaveProperty("id");
  expect(res.json().sha256).toMatch(/^[0-9a-f]{64}$/);
});

test("GET /v1/skill-bundles/:id/download returns binary", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  const created = await pool.query(
    "insert into skill_bundles (name, sha256, size_bytes, content) values ($1,$2,$3,$4) returning id",
    ["demo-skill", "00".repeat(32), 3, Buffer.from([1, 2, 3])],
  );
  const app = await buildServer({ pool });

  const res = await app.inject({
    method: "GET",
    url: `/v1/skill-bundles/${created.rows[0].id}/download`,
  });
  expect(res.statusCode).toBe(200);
  expect(res.headers["content-type"]).toMatch(/gzip|octet-stream/);
  expect(String(res.headers["content-disposition"] ?? "")).toContain("demo-skill.tar.gz");
  expect(Buffer.from(res.rawPayload as any)).toBeTruthy();
});

test("DELETE /v1/skill-bundles/:id removes the bundle", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  const created = await pool.query(
    "insert into skill_bundles (name, sha256, size_bytes, content) values ($1,$2,$3,$4) returning id",
    ["demo-skill", "00".repeat(32), 3, Buffer.from([1, 2, 3])],
  );
  const app = await buildServer({ pool });

  const res = await app.inject({
    method: "DELETE",
    url: `/v1/skill-bundles/${created.rows[0].id}`,
  });
  expect(res.statusCode).toBe(200);

  const remaining = await pool.query("select 1 from skill_bundles where id = $1", [
    created.rows[0].id,
  ]);
  expect(remaining.rowCount).toBe(0);
});
