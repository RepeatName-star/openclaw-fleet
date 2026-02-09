import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { RedisLike } from "../redis.js";

const PatchSchema = z.object({
  name: z.string().min(1).optional(),
  control_ui_url: z.string().url().optional(),
});

type InstanceRoutesOptions = {
  pool?: Pool;
  redis?: RedisLike;
};

export async function registerInstanceRoutes(app: FastifyInstance, opts: InstanceRoutesOptions) {
  app.get("/v1/instances", async (_request, reply) => {
    if (!opts.pool || !opts.redis) {
      reply.code(500).send({ error: "server not configured" });
      return;
    }
    const res = await opts.pool.query(
      "select id, name, updated_at, control_ui_url, skills_snapshot_at from instances order by created_at asc",
    );
    const items = [] as Array<Record<string, unknown>>;
    for (const row of res.rows) {
      const hb = await opts.redis.get(`hb:${row.id}`);
      items.push({
        id: row.id,
        name: row.name,
        updated_at: row.updated_at,
        control_ui_url: row.control_ui_url,
        skills_snapshot_at: row.skills_snapshot_at,
        online: Boolean(hb),
      });
    }
    reply.send({ items });
  });

  app.get("/v1/instances/:id", async (request, reply) => {
    if (!opts.pool) {
      reply.code(500).send({ error: "server not configured" });
      return;
    }
    const { id } = request.params as { id: string };
    const res = await opts.pool.query(
      "select id, name, updated_at, control_ui_url, skills_snapshot, skills_snapshot_at from instances where id = $1",
      [id],
    );
    if (!res.rowCount) {
      reply.code(404).send({ error: "not found" });
      return;
    }
    reply.send(res.rows[0]);
  });

  app.get("/v1/instances/:id/skills", async (request, reply) => {
    if (!opts.pool) {
      reply.code(500).send({ error: "server not configured" });
      return;
    }
    const { id } = request.params as { id: string };
    const res = await opts.pool.query(
      "select skills_snapshot, skills_snapshot_at from instances where id = $1",
      [id],
    );
    if (!res.rowCount) {
      reply.code(404).send({ error: "not found" });
      return;
    }
    reply.send({
      skills: res.rows[0].skills_snapshot,
      updated_at: res.rows[0].skills_snapshot_at,
    });
  });

  app.patch("/v1/instances/:id", async (request, reply) => {
    if (!opts.pool) {
      reply.code(500).send({ error: "server not configured" });
      return;
    }
    const parsed = PatchSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid payload" });
      return;
    }
    const { id } = request.params as { id: string };
    const res = await opts.pool.query(
      "update instances set name = coalesce($2, name), control_ui_url = coalesce($3, control_ui_url), updated_at = now() where id = $1 returning id, name, control_ui_url",
      [id, parsed.data.name ?? null, parsed.data.control_ui_url ?? null],
    );
    if (!res.rowCount) {
      reply.code(404).send({ error: "not found" });
      return;
    }
    reply.send(res.rows[0]);
  });
}
