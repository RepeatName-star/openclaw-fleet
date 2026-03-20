import { buildServer } from "../src/server.js";
import { createTestPool, initTestDb, runMigrations } from "./support/db.js";

test("POST /v1/enroll issues device token", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  const app = await buildServer({
    config: {
      port: 3000,
      databaseUrl: "postgres://test",
      redisUrl: "redis://test",
      enrollmentSecret: "test",
    },
    pool,
  });

  const res = await app.inject({
    method: "POST",
    url: "/v1/enroll",
    payload: { enrollment_token: "test", instance_name: "i-1" },
  });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toHaveProperty("device_token");
});

test("POST /v1/enroll stores last seen ip for new instances", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  const app = await buildServer({
    config: {
      port: 3000,
      databaseUrl: "postgres://test",
      redisUrl: "redis://test",
      enrollmentSecret: "test",
    },
    pool,
  });

  const res = await app.inject({
    method: "POST",
    url: "/v1/enroll",
    payload: { enrollment_token: "test", instance_name: "i-2" },
  });

  expect(res.statusCode).toBe(200);
  const stored = await pool.query("select last_seen_ip from instances where name = $1", ["i-2"]);
  expect(stored.rows[0].last_seen_ip).toEqual(expect.any(String));
});
