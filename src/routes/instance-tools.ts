import type { FastifyInstance, FastifyReply } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { insertArtifact, insertEvent } from "../events/store.js";
import { MailpitRequestError, createMailpitClient } from "../mailpit/client.js";

type InstanceToolsRoutesOptions = {
  pool?: Pool;
  mailFetch?: typeof fetch;
};

type InstanceToolRow = {
  id: string;
  tool_type: string;
  name: string;
  enabled: boolean;
  config: Record<string, unknown> | null;
};

const ListMessagesQuerySchema = z.object({
  query: z.string().optional(),
  start: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const SendMailSchema = z.object({
  from_email: z.string().email(),
  from_name: z.string().optional(),
  to_email: z.string().email(),
  to_name: z.string().optional(),
  subject: z.string().min(1),
  text: z.string(),
  html: z.string().optional(),
});

function sanitizeToolConfig(toolType: string, config: unknown) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return {};
  }

  const record = config as Record<string, unknown>;
  if (toolType === "mail") {
    const sanitized: Record<string, unknown> = {};
    const allowedKeys = [
      "base_url",
      "username",
      "default_from_email",
      "default_from_name",
    ] as const;
    for (const key of allowedKeys) {
      const value = record[key];
      if (typeof value === "string" && value.length > 0) {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  return {};
}

function summarizeListResponse(data: Record<string, unknown>) {
  return {
    total: Number(data.total ?? 0),
    unread: Number(data.unread ?? 0),
    count: Number(data.count ?? 0),
  };
}

function summarizeMessage(message: Record<string, unknown>) {
  return {
    ID: message.ID,
    Subject: message.Subject,
    Text: message.Text,
  };
}

async function ensureInstanceExists(pool: Pool, instanceId: string) {
  const instance = await pool.query("select id from instances where id = $1", [instanceId]);
  return instance.rowCount > 0;
}

async function loadMailTool(pool: Pool, instanceId: string, toolId: string) {
  const tool = await pool.query(
    `select id, tool_type, name, enabled, config
     from instance_tools
     where instance_id = $1 and id = $2`,
    [instanceId, toolId],
  );
  if (!tool.rowCount) {
    return null;
  }
  const row = tool.rows[0] as InstanceToolRow;
  return row;
}

function createMailClientOrThrow(
  tool: Awaited<ReturnType<typeof loadMailTool>>,
  fetcher?: typeof fetch,
) {
  if (!tool) {
    throw new Error("tool not found");
  }
  if (tool.tool_type !== "mail") {
    throw new Error("unsupported tool type");
  }
  if (!tool.enabled) {
    throw new Error("tool disabled");
  }
  const config = tool.config ?? {};
  const baseUrl = typeof config.base_url === "string" ? config.base_url : "";
  const username = typeof config.username === "string" ? config.username : "";
  const password = typeof config.password === "string" ? config.password : "";
  if (!baseUrl || !username || !password) {
    throw new Error("tool config invalid");
  }
  return createMailpitClient({ baseUrl, username, password, fetcher });
}

async function writeToolAudit(params: {
  pool: Pool;
  instanceId: string;
  eventType: string;
  artifactKind: string;
  payload: Record<string, unknown>;
  artifact: Record<string, unknown>;
}) {
  const artifact = await insertArtifact(params.pool, {
    kind: params.artifactKind,
    content: params.artifact,
  });
  await insertEvent(params.pool, {
    event_type: params.eventType,
    instance_id: params.instanceId,
    artifact_id: artifact.id,
    payload: params.payload,
  });
}

function handleMailToolError(reply: FastifyReply, error: unknown) {
  if (error instanceof MailpitRequestError) {
    reply.code(502).send({ error: error.message });
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (message === "tool not found") {
    reply.code(404).send({ error: "not found" });
    return;
  }
  if (message === "unsupported tool type") {
    reply.code(400).send({ error: message });
    return;
  }
  if (message === "tool disabled") {
    reply.code(409).send({ error: message });
    return;
  }
  if (message === "tool config invalid") {
    reply.code(400).send({ error: message });
    return;
  }
  reply.code(500).send({ error: message });
}

export async function registerInstanceToolsRoutes(
  app: FastifyInstance,
  opts: InstanceToolsRoutesOptions,
) {
  app.get("/v1/instances/:id/tools", async (request, reply) => {
    if (!opts.pool) {
      reply.code(500).send({ error: "server not configured" });
      return;
    }

    const { id } = request.params as { id: string };
    const instance = await opts.pool.query("select id from instances where id = $1", [id]);
    if (!instance.rowCount) {
      reply.code(404).send({ error: "not found" });
      return;
    }

    const res = await opts.pool.query(
      `select id, tool_type, name, enabled, config
       from instance_tools
       where instance_id = $1 and enabled = true
       order by created_at asc, id asc`,
      [id],
    );
    const items = res.rows as InstanceToolRow[];

    reply.send({
      items: items.map((row) => ({
        id: String(row.id),
        tool_type: String(row.tool_type),
        name: String(row.name),
        enabled: Boolean(row.enabled),
        config: sanitizeToolConfig(String(row.tool_type), row.config),
      })),
    });
  });

  app.get("/v1/instances/:id/tools/:toolId/mail/messages", async (request, reply) => {
    if (!opts.pool) {
      reply.code(500).send({ error: "server not configured" });
      return;
    }

    const { id: instanceId, toolId } = request.params as { id: string; toolId: string };
    if (!(await ensureInstanceExists(opts.pool, instanceId))) {
      reply.code(404).send({ error: "not found" });
      return;
    }
    const parsed = ListMessagesQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid query" });
      return;
    }

    try {
      const tool = await loadMailTool(opts.pool, instanceId, toolId);
      const client = createMailClientOrThrow(tool, opts.mailFetch);
      const data = parsed.data.query
        ? await client.searchMessages({
            query: parsed.data.query,
            start: parsed.data.start,
            limit: parsed.data.limit,
          })
        : await client.listMessages({
            start: parsed.data.start,
            limit: parsed.data.limit,
          });

      await writeToolAudit({
        pool: opts.pool,
        instanceId,
        eventType: "tool.mail.query",
        artifactKind: "tool.mail.query",
        payload: {
          tool_id: toolId,
          tool_name: tool?.name ?? "",
          mode: parsed.data.query ? "search" : "list",
          query: parsed.data.query ?? null,
        },
        artifact: {
          tool_id: toolId,
          request: parsed.data,
          response: summarizeListResponse(data as Record<string, unknown>),
        },
      });

      reply.send(data);
    } catch (error) {
      handleMailToolError(reply, error);
    }
  });

  app.get("/v1/instances/:id/tools/:toolId/mail/messages/:messageId", async (request, reply) => {
    if (!opts.pool) {
      reply.code(500).send({ error: "server not configured" });
      return;
    }

    const { id: instanceId, toolId, messageId } = request.params as {
      id: string;
      toolId: string;
      messageId: string;
    };
    if (!(await ensureInstanceExists(opts.pool, instanceId))) {
      reply.code(404).send({ error: "not found" });
      return;
    }

    try {
      const tool = await loadMailTool(opts.pool, instanceId, toolId);
      const client = createMailClientOrThrow(tool, opts.mailFetch);
      const data = await client.getMessage(messageId);

      await writeToolAudit({
        pool: opts.pool,
        instanceId,
        eventType: "tool.mail.read",
        artifactKind: "tool.mail.read",
        payload: {
          tool_id: toolId,
          tool_name: tool?.name ?? "",
          message_id: messageId,
        },
        artifact: {
          tool_id: toolId,
          message: summarizeMessage(data as Record<string, unknown>),
        },
      });

      reply.send(data);
    } catch (error) {
      handleMailToolError(reply, error);
    }
  });

  app.post("/v1/instances/:id/tools/:toolId/mail/send", async (request, reply) => {
    if (!opts.pool) {
      reply.code(500).send({ error: "server not configured" });
      return;
    }

    const { id: instanceId, toolId } = request.params as { id: string; toolId: string };
    if (!(await ensureInstanceExists(opts.pool, instanceId))) {
      reply.code(404).send({ error: "not found" });
      return;
    }
    const parsed = SendMailSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid payload" });
      return;
    }

    try {
      const tool = await loadMailTool(opts.pool, instanceId, toolId);
      const client = createMailClientOrThrow(tool, opts.mailFetch);
      const data = await client.sendMessage(parsed.data);
      const result = data as Record<string, unknown>;

      await writeToolAudit({
        pool: opts.pool,
        instanceId,
        eventType: "tool.mail.send",
        artifactKind: "tool.mail.send",
        payload: {
          tool_id: toolId,
          tool_name: tool?.name ?? "",
          message_id: typeof result.ID === "string" ? result.ID : null,
        },
        artifact: {
          tool_id: toolId,
          request: {
            from_email: parsed.data.from_email,
            to_email: parsed.data.to_email,
            subject: parsed.data.subject,
          },
          response: result,
        },
      });

      reply.send(result);
    } catch (error) {
      handleMailToolError(reply, error);
    }
  });
}
