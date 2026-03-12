import { buildServer } from "../src/server.js";
import { initTestDb, runMigrations, createTestPool } from "./support/db.js";

test("GET /v1/artifacts/:id returns artifact content", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  const a = await pool.query(
    "insert into artifacts (kind, content) values ($1,$2) returning id",
    ["task.result", { raw: "x" }],
  );
  const app = await buildServer({ pool });

  const res = await app.inject({
    method: "GET",
    url: `/v1/artifacts/${a.rows[0].id}`,
  });
  expect(res.statusCode).toBe(200);
  expect(res.json().kind).toBe("task.result");
  expect(res.json().content.raw).toBe("x");
});

