import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { parseLabelSelector } from "../labels/label-selector.js";

const CreateSchema = z.object({
  name: z.string().min(1),
  selector: z.string().min(1),
  action: z.string().min(1),
  payload: z.record(z.unknown()).optional(),
  gate: z.record(z.unknown()).optional(),
  rollout: z.record(z.unknown()).optional(),
  expires_at: z.string().datetime().optional(),
});

const PatchSchema = z.object({
  name: z.string().min(1).optional(),
  selector: z.string().min(1).optional(),
  action: z.string().min(1).optional(),
  payload: z.record(z.unknown()).optional(),
  gate: z.record(z.unknown()).optional(),
  rollout: z.record(z.unknown()).optional(),
  expires_at: z.string().datetime().optional(),
});

const ListQuerySchema = z.object({
  include_deleted: z.union([z.string(), z.boolean()]).optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(10),
});

function isTruthyFlag(value: string | boolean | undefined): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  return value === "1" || value.toLowerCase() === "true";
}

export async function registerCampaignRoutes(app: FastifyInstance, opts: { pool?: Pool }) {
  async function handleDelete(id: string, reply: any) {
    if (!opts.pool) {
      reply.code(500).send({ error: "server not configured" });
      return;
    }

    const current = await opts.pool.query(
      "select id, status from campaigns where id = $1 and status <> 'deleted'",
      [id],
    );
    if (!current.rowCount) {
      reply.code(404).send({ error: "not found" });
      return;
    }
    if (current.rows[0].status !== "closed") {
      reply.code(409).send({ error: "campaign must be closed before delete" });
      return;
    }

    await opts.pool.query(
      "update campaigns set status = 'deleted', updated_at = now() where id = $1",
      [id],
    );
    reply.send({ ok: true });
  }

  app.get("/v1/campaigns", async (request, reply) => {
    if (!opts.pool) {
      reply.code(500).send({ error: "server not configured" });
      return;
    }
    const parsedQuery = ListQuerySchema.safeParse(request.query ?? {});
    if (!parsedQuery.success) {
      reply.code(400).send({ error: "invalid query" });
      return;
    }
    const includeDeleted = isTruthyFlag(parsedQuery.data.include_deleted);
    const { q, page, page_size } = parsedQuery.data;
    const conditions: string[] = [];
    const values: Array<string | number> = [];
    if (!includeDeleted) {
      conditions.push("status <> 'deleted'");
    }
    if (q) {
      values.push(`%${q.toLowerCase()}%`);
      conditions.push(`lower(name) like $${values.length}`);
    }
    const whereClause = conditions.length ? `where ${conditions.join(" and ")}` : "";
    const countRes = await opts.pool.query(
      `select count(*)::int as total from campaigns ${whereClause}`,
      values,
    );
    values.push(page_size);
    values.push((page - 1) * page_size);
    const res = await opts.pool.query(
      `select id, name, selector, action, generation, status, created_at, updated_at, closed_at, expires_at
       from campaigns
       ${whereClause}
       order by created_at desc, id desc
       limit $${values.length - 1}
       offset $${values.length}`,
      values,
    );
    reply.send({ items: res.rows, total: countRes.rows[0]?.total ?? 0, page, page_size });
  });

  app.post("/v1/campaigns", async (request, reply) => {
    if (!opts.pool) {
      reply.code(500).send({ error: "server not configured" });
      return;
    }
    const parsed = CreateSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid payload" });
      return;
    }
    const selectorParsed = parseLabelSelector(parsed.data.selector);
    if (!selectorParsed.selector) {
      reply.code(400).send({ error: "invalid selector" });
      return;
    }
    const row = await opts.pool.query(
      "insert into campaigns (name, selector, action, payload, gate, rollout, expires_at) values ($1,$2,$3,$4,$5,$6,$7) returning *",
      [
        parsed.data.name,
        parsed.data.selector,
        parsed.data.action,
        parsed.data.payload ?? {},
        parsed.data.gate ?? {},
        parsed.data.rollout ?? {},
        parsed.data.expires_at ?? null,
      ],
    );
    reply.send(row.rows[0]);
  });

  app.get("/v1/campaigns/:id", async (request, reply) => {
    if (!opts.pool) {
      reply.code(500).send({ error: "server not configured" });
      return;
    }
    const { id } = request.params as { id: string };
    const res = await opts.pool.query(
      "select * from campaigns where id = $1 and status <> 'deleted'",
      [id],
    );
    if (!res.rowCount) {
      reply.code(404).send({ error: "not found" });
      return;
    }
    reply.send(res.rows[0]);
  });

  app.patch("/v1/campaigns/:id", async (request, reply) => {
    if (!opts.pool) {
      reply.code(500).send({ error: "server not configured" });
      return;
    }
    const parsed = PatchSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid payload" });
      return;
    }
    if (parsed.data.selector !== undefined) {
      const selectorParsed = parseLabelSelector(parsed.data.selector);
      if (!selectorParsed.selector) {
        reply.code(400).send({ error: "invalid selector" });
        return;
      }
    }

    const { id } = request.params as { id: string };

    const current = await opts.pool.query(
      "select id, action, payload, generation from campaigns where id = $1 and status <> 'deleted'",
      [id],
    );
    if (!current.rowCount) {
      reply.code(404).send({ error: "not found" });
      return;
    }

    const oldAction = current.rows[0].action as string;
    const oldPayload = current.rows[0].payload as Record<string, unknown>;
    const oldGeneration = current.rows[0].generation as number;

    const nextAction = parsed.data.action ?? oldAction;
    const nextPayload = parsed.data.payload ?? oldPayload;

    let nextGeneration = oldGeneration;
    if (nextAction !== oldAction || JSON.stringify(nextPayload) !== JSON.stringify(oldPayload)) {
      nextGeneration = oldGeneration + 1;
    }

    const res = await opts.pool.query(
      "update campaigns set name = coalesce($2, name), selector = coalesce($3, selector), action = coalesce($4, action), payload = coalesce($5, payload), gate = coalesce($6, gate), rollout = coalesce($7, rollout), expires_at = coalesce($8, expires_at), generation = $9, updated_at = now() where id = $1 and status <> 'deleted' returning *",
      [
        id,
        parsed.data.name ?? null,
        parsed.data.selector ?? null,
        parsed.data.action ?? null,
        parsed.data.payload ?? null,
        parsed.data.gate ?? null,
        parsed.data.rollout ?? null,
        parsed.data.expires_at ?? null,
        nextGeneration,
      ],
    );
    reply.send(res.rows[0]);
  });

  app.post("/v1/campaigns/:id/close", async (request, reply) => {
    if (!opts.pool) {
      reply.code(500).send({ error: "server not configured" });
      return;
    }
    const { id } = request.params as { id: string };
    const res = await opts.pool.query(
      "update campaigns set status = 'closed', closed_at = now(), updated_at = now() where id = $1 and status = 'open' returning id, status, closed_at",
      [id],
    );
    if (!res.rowCount) {
      reply.code(404).send({ error: "not found" });
      return;
    }
    reply.send(res.rows[0]);
  });

  app.delete("/v1/campaigns/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    await handleDelete(id, reply);
  });

  app.post("/v1/campaigns/:id/delete", async (request, reply) => {
    const { id } = request.params as { id: string };
    await handleDelete(id, reply);
  });
}
