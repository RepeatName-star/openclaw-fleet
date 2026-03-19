import { buildServer } from "../src/server.js";
import { createTestPool, initTestDb, runMigrations } from "./support/db.js";

test("POST /v1/tasks rejects legacy group targets", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);

  const app = await buildServer({ pool });
  const res = await app.inject({
    method: "POST",
    url: "/v1/tasks",
    payload: {
      target_type: "group",
      target_id: "g1",
      action: "skills.update",
      payload: {},
    },
  });
  expect(res.statusCode).toBe(400);
});

test("POST /v1/tasks accepts optional task_name", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  const instance = await pool.query("insert into instances (name) values ('i-1') returning id");
  const instanceId = String(instance.rows[0].id);

  const app = await buildServer({ pool });
  const res = await app.inject({
    method: "POST",
    url: "/v1/tasks",
    payload: {
      target_type: "instance",
      target_id: instanceId,
      task_name: "refresh skills inventory",
      action: "skills.status",
      payload: {},
    },
  });

  expect(res.statusCode).toBe(200);
  const stored = await pool.query("select task_name from tasks where id = $1", [res.json().id]);
  expect(stored.rows[0].task_name).toBe("refresh skills inventory");
});

test("POST /v1/tasks emits audit event with redacted message and raw payload artifact", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  const instance = await pool.query("insert into instances (name) values ('i-1') returning id");
  const instanceId = String(instance.rows[0].id);

  const app = await buildServer({ pool });
  const res = await app.inject({
    method: "POST",
    url: "/v1/tasks",
    payload: {
      target_type: "instance",
      target_id: instanceId,
      action: "agent.run",
      payload: {
        message: "reset all workers now",
        agentId: "main",
        sessionKey: "agent:main:main",
      },
    },
  });
  expect(res.statusCode).toBe(200);

  const events = await pool.query(
    "select event_type, payload, artifact_id from events order by ts asc",
  );
  expect(events.rowCount).toBe(1);
  expect(events.rows[0].event_type).toBe("exec.queued");
  expect(events.rows[0].payload.payload.message).toMatch(/\[sha256:/);
  expect(events.rows[0].artifact_id).toBeTruthy();

  const artifacts = await pool.query("select kind, content from artifacts where id = $1", [
    events.rows[0].artifact_id,
  ]);
  expect(artifacts.rowCount).toBe(1);
  expect(artifacts.rows[0].kind).toBe("task.payload");
  expect(artifacts.rows[0].content.payload.message).toBe("reset all workers now");
});

test("POST /v1/tasks redacts config patch raw in queued events but keeps artifact raw", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  const instance = await pool.query("insert into instances (name) values ('i-1') returning id");
  const instanceId = String(instance.rows[0].id);

  const app = await buildServer({ pool });
  const res = await app.inject({
    method: "POST",
    url: "/v1/tasks",
    payload: {
      target_type: "instance",
      target_id: instanceId,
      action: "fleet.config_patch",
      payload: {
        raw: "{\"models\":{\"default\":\"zai/glm-5-turbo\"}}",
        note: "switch model",
      },
    },
  });
  expect(res.statusCode).toBe(200);

  const events = await pool.query("select payload, artifact_id from events order by ts asc");
  expect(events.rowCount).toBe(1);
  expect(events.rows[0].payload.payload.raw).toMatch(/\[sha256:/);

  const artifacts = await pool.query("select content from artifacts where id = $1", [
    events.rows[0].artifact_id,
  ]);
  expect(artifacts.rowCount).toBe(1);
  expect(artifacts.rows[0].content.payload.raw).toBe(
    "{\"models\":{\"default\":\"zai/glm-5-turbo\"}}",
  );
});
