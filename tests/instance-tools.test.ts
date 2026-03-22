import { buildServer } from "../src/server.js";
import { createTestPool, initTestDb, runMigrations } from "./support/db.js";

async function createMailTool(pool: Awaited<ReturnType<typeof createTestPool>>, instanceId: string) {
  const inserted = await pool.query(
    `insert into instance_tools (instance_id, tool_type, name, enabled, config)
     values ($1, 'mail', 'Mailpit', true, $2)
     returning id`,
    [
      instanceId,
      {
        base_url: "http://127.0.0.1:33825/api/v1",
        username: "openclaw",
        password: "secret-password",
      },
    ],
  );
  return String(inserted.rows[0].id);
}

test("GET /v1/instances/:id/tools lists enabled tools for one instance and sanitizes secrets", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);

  const instanceA = await pool.query("insert into instances (name) values ('i-1') returning id");
  const instanceB = await pool.query("insert into instances (name) values ('i-2') returning id");

  await pool.query(
    `insert into instance_tools (instance_id, tool_type, name, enabled, config)
     values ($1, 'mail', 'Mailpit', true, $2),
            ($1, 'mail', 'Disabled Mailpit', false, $3),
            ($4, 'mail', 'Other Instance Mailpit', true, $5)`,
    [
      instanceA.rows[0].id,
      {
        base_url: "http://127.0.0.1:33825/api/v1",
        username: "openclaw",
        password: "secret-password",
      },
      {
        base_url: "http://127.0.0.1:33825/api/v1",
        username: "disabled",
        password: "should-not-return",
      },
      instanceB.rows[0].id,
      {
        base_url: "http://127.0.0.1:33825/api/v1",
        username: "other",
        password: "other-secret",
      },
    ],
  );

  const redis = { set: async () => "OK", get: async () => null };
  const app = await buildServer({ pool, redis });

  const res = await app.inject({
    method: "GET",
    url: `/v1/instances/${instanceA.rows[0].id}/tools`,
  });

  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({
    items: [
      {
        id: expect.any(String),
        tool_type: "mail",
        name: "Mailpit",
        enabled: true,
        config: {
          base_url: "http://127.0.0.1:33825/api/v1",
          username: "openclaw",
        },
      },
    ],
  });
});

test("GET /v1/instances/:id/tools returns 404 for missing instance", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  const redis = { set: async () => "OK", get: async () => null };
  const app = await buildServer({ pool, redis });

  const res = await app.inject({
    method: "GET",
    url: "/v1/instances/00000000-0000-0000-0000-000000000999/tools",
  });

  expect(res.statusCode).toBe(404);
});

test("GET /v1/instances/:id/tools/:toolId/mail/messages proxies Mailpit list and search and writes audit records", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  const instance = await pool.query("insert into instances (name) values ('i-1') returning id");
  const toolId = await createMailTool(pool, String(instance.rows[0].id));
  const redis = { set: async () => "OK", get: async () => null };

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url === "http://127.0.0.1:33825/api/v1/messages?start=0&limit=20" && method === "GET") {
      return new Response(
        JSON.stringify({
          total: 1,
          unread: 1,
          count: 1,
          start: 0,
          messages: [
            {
              ID: "m-1",
              Read: false,
              Subject: "hello",
              Created: "2026-03-22T06:00:00.000Z",
              Snippet: "preview",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    if (
      url === "http://127.0.0.1:33825/api/v1/search?query=subject%3A%22hello%22&start=0&limit=20" &&
      method === "GET"
    ) {
      return new Response(
        JSON.stringify({
          total: 1,
          unread: 0,
          count: 1,
          start: 0,
          messages: [
            {
              ID: "m-1",
              Read: true,
              Subject: "hello",
              Created: "2026-03-22T06:00:00.000Z",
              Snippet: "preview",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    throw new Error(`unexpected ${method} ${url}`);
  });

  const app = await buildServer({ pool, redis, mailFetch: fetchMock as typeof fetch });

  const listRes = await app.inject({
    method: "GET",
    url: `/v1/instances/${instance.rows[0].id}/tools/${toolId}/mail/messages?start=0&limit=20`,
  });

  expect(listRes.statusCode).toBe(200);
  expect(listRes.json()).toMatchObject({
    total: 1,
    messages: [{ ID: "m-1", Subject: "hello" }],
  });

  const searchRes = await app.inject({
    method: "GET",
    url: `/v1/instances/${instance.rows[0].id}/tools/${toolId}/mail/messages?query=subject:%22hello%22&start=0&limit=20`,
  });

  expect(searchRes.statusCode).toBe(200);
  expect(searchRes.json()).toMatchObject({
    total: 1,
    messages: [{ ID: "m-1", Read: true }],
  });

  const events = await pool.query(
    "select event_type, payload, artifact_id from events where event_type = 'tool.mail.query' order by ts asc",
  );
  expect(events.rows).toHaveLength(2);
  expect(events.rows[0].payload).toMatchObject({ tool_id: toolId, mode: "list" });
  expect(events.rows[1].payload).toMatchObject({ tool_id: toolId, mode: "search" });

  const artifact = await pool.query(
    "select kind, content from artifacts where id = $1",
    [events.rows[0].artifact_id],
  );
  expect(artifact.rows[0]).toMatchObject({
    kind: "tool.mail.query",
  });
});

test("GET /v1/instances/:id/tools/:toolId/mail/messages/:messageId proxies Mailpit detail", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  const instance = await pool.query("insert into instances (name) values ('i-1') returning id");
  const toolId = await createMailTool(pool, String(instance.rows[0].id));
  const redis = { set: async () => "OK", get: async () => null };

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url === "http://127.0.0.1:33825/api/v1/message/m-1" && method === "GET") {
      return new Response(
        JSON.stringify({
          ID: "m-1",
          Subject: "hello",
          Text: "body",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    throw new Error(`unexpected ${method} ${url}`);
  });

  const app = await buildServer({ pool, redis, mailFetch: fetchMock as typeof fetch });

  const res = await app.inject({
    method: "GET",
    url: `/v1/instances/${instance.rows[0].id}/tools/${toolId}/mail/messages/m-1`,
  });

  expect(res.statusCode).toBe(200);
  expect(res.json()).toMatchObject({
    ID: "m-1",
    Subject: "hello",
    Text: "body",
  });
});

test("POST /v1/instances/:id/tools/:toolId/mail/send proxies Mailpit send and writes audit record", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  const instance = await pool.query("insert into instances (name) values ('i-1') returning id");
  const toolId = await createMailTool(pool, String(instance.rows[0].id));
  const redis = { set: async () => "OK", get: async () => null };
  let sentBody: Record<string, unknown> | null = null;

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url === "http://127.0.0.1:33825/api/v1/send" && method === "POST") {
      sentBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response(JSON.stringify({ ID: "mail-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    throw new Error(`unexpected ${method} ${url}`);
  });

  const app = await buildServer({ pool, redis, mailFetch: fetchMock as typeof fetch });

  const res = await app.inject({
    method: "POST",
    url: `/v1/instances/${instance.rows[0].id}/tools/${toolId}/mail/send`,
    payload: {
      from_email: "web@example.test",
      from_name: "Web UI",
      to_email: "target@example.test",
      to_name: "Target",
      subject: "HTTP send example",
      text: "hello from http api",
    },
  });

  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ ID: "mail-1" });
  expect(sentBody).toEqual({
    From: { Email: "web@example.test", Name: "Web UI" },
    To: [{ Email: "target@example.test", Name: "Target" }],
    Subject: "HTTP send example",
    Text: "hello from http api",
  });

  const events = await pool.query(
    "select event_type, payload, artifact_id from events where event_type = 'tool.mail.send'",
  );
  expect(events.rows).toHaveLength(1);
  expect(events.rows[0].payload).toMatchObject({
    tool_id: toolId,
    tool_name: "Mailpit",
    message_id: "mail-1",
  });
});

test("mail tool endpoints reject disabled tools and upstream failures", async () => {
  const db = initTestDb();
  await runMigrations(db);
  const pool = createTestPool(db);
  const instance = await pool.query("insert into instances (name) values ('i-1') returning id");
  const inserted = await pool.query(
    `insert into instance_tools (instance_id, tool_type, name, enabled, config)
     values ($1, 'mail', 'Mailpit', false, $2)
     returning id`,
    [
      instance.rows[0].id,
      {
        base_url: "http://127.0.0.1:33825/api/v1",
        username: "openclaw",
        password: "secret-password",
      },
    ],
  );
  const disabledToolId = String(inserted.rows[0].id);

  const redis = { set: async () => "OK", get: async () => null };
  const failureFetch = vi.fn(async () => new Response("boom", { status: 500 }));
  const app = await buildServer({ pool, redis, mailFetch: failureFetch as typeof fetch });

  const disabledRes = await app.inject({
    method: "GET",
    url: `/v1/instances/${instance.rows[0].id}/tools/${disabledToolId}/mail/messages`,
  });
  expect(disabledRes.statusCode).toBe(409);

  await pool.query("update instance_tools set enabled = true where id = $1", [disabledToolId]);
  const upstreamRes = await app.inject({
    method: "GET",
    url: `/v1/instances/${instance.rows[0].id}/tools/${disabledToolId}/mail/messages`,
  });
  expect(upstreamRes.statusCode).toBe(502);
});
