import { buildServer } from "../src/server.js";
import { issueDeviceToken } from "../src/auth.js";
import { createTestPool, initTestDb, runMigrations } from "./support/db.js";

test("POST /v1/heartbeat updates last_seen", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);

  const created = await pool.query(
    "insert into instances (name) values ($1) returning id",
    ["i-1"],
  );
  const instanceId = created.rows[0].id as string;
  const token = await issueDeviceToken(pool, { instanceId, scopes: ["operator.admin"] });

  const redis = {
    set: async () => "OK",
  };

  const app = await buildServer({ pool, redis });
  const res = await app.inject({
    method: "POST",
    url: "/v1/heartbeat",
    headers: { authorization: `Bearer ${token}` },
  });
  expect(res.statusCode).toBe(200);
});
