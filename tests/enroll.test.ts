import { buildServer } from "../src/server";
import { createTestPool, initTestDb, runMigrations } from "./support/db";

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
