import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";

const CreateSchema = z.object({
  name: z.string().min(1),
  selector: z.string().min(1),
  action: z.string().min(1),
  payload: z.record(z.unknown()).optional(),
  gate: z.record(z.unknown()).optional(),
  rollout: z.record(z.unknown()).optional(),
  expires_at: z.string().datetime().optional(),
});

export async function registerCampaignRoutes(app: FastifyInstance, opts: { pool?: Pool }) {
  app.get("/v1/campaigns", async (_req, reply) => {
    if (!opts.pool) {
      reply.code(500).send({ error: "server not configured" });
      return;
    }
    const res = await opts.pool.query(
      "select id, name, selector, action, generation, status, created_at, updated_at, closed_at, expires_at from campaigns order by created_at desc",
    );
    reply.send({ items: res.rows });
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
    const res = await opts.pool.query("select * from campaigns where id = $1", [id]);
    if (!res.rowCount) {
      reply.code(404).send({ error: "not found" });
      return;
    }
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
}

