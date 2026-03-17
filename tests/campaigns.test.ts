import { buildServer } from "../src/server.js";
import { createTestPool, initTestDb, runMigrations } from "./support/db.js";

const redis = { set: async () => "OK", get: async () => null };

test("POST /v1/campaigns creates an open campaign", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  const app = await buildServer({ pool, redis });

  const res = await app.inject({
    method: "POST",
    url: "/v1/campaigns",
    payload: {
      name: "c1",
      selector: "biz.openclaw.io/team=a",
      action: "skills.status",
      payload: {},
    },
  });
  expect(res.statusCode).toBe(200);
  const body = res.json();
  expect(body.status).toBe("open");
  expect(body.generation).toBe(1);
  expect(body).toHaveProperty("id");
});

test("POST /v1/campaigns rejects invalid selector", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  const app = await buildServer({ pool, redis });

  const res = await app.inject({
    method: "POST",
    url: "/v1/campaigns",
    payload: {
      name: "c1",
      selector: "biz.openclaw.io/",
      action: "skills.status",
      payload: {},
    },
  });

  expect(res.statusCode).toBe(400);
  expect(res.json()).toEqual({ error: "invalid selector" });
});

test("GET /v1/campaigns lists campaigns", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  await pool.query(
    "insert into campaigns (name, selector, action, payload) values ($1,$2,$3,$4)",
    ["c1", "biz.openclaw.io/team=a", "skills.status", {}],
  );
  const app = await buildServer({ pool, redis });

  const res = await app.inject({ method: "GET", url: "/v1/campaigns" });
  expect(res.statusCode).toBe(200);
  expect(res.json().items).toHaveLength(1);
  expect(res.json().items[0].name).toBe("c1");
});

test("GET /v1/campaigns?include_deleted=true includes soft-deleted campaigns", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  await pool.query(
    "insert into campaigns (name, selector, action, payload, status, closed_at) values ($1,$2,$3,$4,'deleted',now())",
    ["c-deleted", "biz.openclaw.io/team=a", "skills.status", {}],
  );
  const app = await buildServer({ pool, redis });

  const hidden = await app.inject({ method: "GET", url: "/v1/campaigns" });
  expect(hidden.statusCode).toBe(200);
  expect(hidden.json().items).toEqual([]);

  const res = await app.inject({ method: "GET", url: "/v1/campaigns?include_deleted=true" });
  expect(res.statusCode).toBe(200);
  expect(res.json().items).toHaveLength(1);
  expect(res.json().items[0].name).toBe("c-deleted");
  expect(res.json().items[0].status).toBe("deleted");
});

test("POST /v1/campaigns/:id/close closes a campaign", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  const created = await pool.query(
    "insert into campaigns (name, selector, action, payload) values ($1,$2,$3,$4) returning id",
    ["c1", "biz.openclaw.io/team=a", "skills.status", {}],
  );
  const app = await buildServer({ pool, redis });

  const res = await app.inject({
    method: "POST",
    url: `/v1/campaigns/${created.rows[0].id}/close`,
  });
  expect(res.statusCode).toBe(200);

  const row = await pool.query("select status, closed_at from campaigns where id = $1", [
    created.rows[0].id,
  ]);
  expect(row.rows[0].status).toBe("closed");
  expect(row.rows[0].closed_at).toBeTruthy();
});

test("PATCH /v1/campaigns/:id increments generation only when action/payload change", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  const created = await pool.query(
    "insert into campaigns (name, selector, action, payload) values ($1,$2,$3,$4) returning id, generation",
    ["c1", "biz.openclaw.io/team=a", "skills.status", {}],
  );
  const id = created.rows[0].id as string;
  const app = await buildServer({ pool, redis });

  const patch1 = await app.inject({
    method: "PATCH",
    url: `/v1/campaigns/${id}`,
    payload: { selector: "biz.openclaw.io/team=b" },
  });
  expect(patch1.statusCode).toBe(200);
  expect(patch1.json().generation).toBe(1);

  const patch2 = await app.inject({
    method: "PATCH",
    url: `/v1/campaigns/${id}`,
    payload: { action: "skills.update", payload: { skillKey: "x", enabled: true } },
  });
  expect(patch2.statusCode).toBe(200);
  expect(patch2.json().generation).toBe(2);
});

test("PATCH /v1/campaigns/:id rejects invalid selector", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  const created = await pool.query(
    "insert into campaigns (name, selector, action, payload) values ($1,$2,$3,$4) returning id",
    ["c1", "biz.openclaw.io/team=a", "skills.status", {}],
  );
  const id = created.rows[0].id as string;
  const app = await buildServer({ pool, redis });

  const res = await app.inject({
    method: "PATCH",
    url: `/v1/campaigns/${id}`,
    payload: { selector: "biz.openclaw.io/" },
  });

  expect(res.statusCode).toBe(400);
  expect(res.json()).toEqual({ error: "invalid selector" });
});

test("DELETE /v1/campaigns/:id rejects open campaigns", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  const created = await pool.query(
    "insert into campaigns (name, selector, action, payload) values ($1,$2,$3,$4) returning id",
    ["c1", "biz.openclaw.io/team=a", "skills.status", {}],
  );
  const app = await buildServer({ pool, redis });

  const res = await app.inject({
    method: "DELETE",
    url: `/v1/campaigns/${created.rows[0].id}`,
  });

  expect(res.statusCode).toBe(409);
});

test("DELETE /v1/campaigns/:id hides closed campaign but preserves event filtering", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  const created = await pool.query(
    "insert into campaigns (name, selector, action, payload, status, closed_at) values ($1,$2,$3,$4,'closed',now()) returning id",
    ["c1", "biz.openclaw.io/team=a", "skills.status", {}],
  );
  const campaignId = String(created.rows[0].id);
  const artifact = await pool.query(
    "insert into artifacts (kind, content) values ('task.payload', $1) returning id",
    [{ task_id: "t1" }],
  );
  const artifactId = String(artifact.rows[0].id);
  await pool.query(
    "insert into events (event_type, campaign_id, campaign_generation, payload, artifact_id) values ('exec.finished', $1, 1, $2, $3)",
    [campaignId, { task_id: "t1" }, artifactId],
  );

  const app = await buildServer({ pool, redis });

  const res = await app.inject({
    method: "DELETE",
    url: `/v1/campaigns/${campaignId}`,
  });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ ok: true });

  const campaigns = await app.inject({ method: "GET", url: "/v1/campaigns" });
  expect(campaigns.statusCode).toBe(200);
  expect(campaigns.json().items).toEqual([]);

  const campaignDetail = await app.inject({
    method: "GET",
    url: `/v1/campaigns/${campaignId}`,
  });
  expect(campaignDetail.statusCode).toBe(404);

  const events = await pool.query("select event_type, campaign_id, artifact_id from events where artifact_id = $1", [
    artifactId,
  ]);
  expect(events.rowCount).toBe(1);
  expect(events.rows[0].event_type).toBe("exec.finished");
  expect(events.rows[0].campaign_id).toBe(campaignId);
  expect(String(events.rows[0].artifact_id)).toBe(artifactId);

  const filteredEvents = await app.inject({
    method: "GET",
    url: `/v1/events?campaign_id=${campaignId}`,
  });
  expect(filteredEvents.statusCode).toBe(200);
  expect(filteredEvents.json().items).toHaveLength(1);
  expect(filteredEvents.json().items[0].campaign_id).toBe(campaignId);
});

test("POST /v1/campaigns/:id/delete matches delete semantics for closed campaigns", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  const created = await pool.query(
    "insert into campaigns (name, selector, action, payload, status, closed_at) values ($1,$2,$3,$4,'closed',now()) returning id",
    ["c1", "biz.openclaw.io/team=a", "skills.status", {}],
  );
  const app = await buildServer({ pool, redis });

  const res = await app.inject({
    method: "POST",
    url: `/v1/campaigns/${created.rows[0].id}/delete`,
  });

  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ ok: true });
});
