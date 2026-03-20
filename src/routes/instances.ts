import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { RedisLike } from "../redis.js";

const PatchSchema = z.object({
  name: z.string().min(1).optional(),
  display_name: z.string().min(1).optional(),
  control_ui_url: z.string().url().optional(),
});

type InstanceRoutesOptions = {
  pool?: Pool;
  redis?: RedisLike;
};

const ListQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(10),
});

export async function registerInstanceRoutes(app: FastifyInstance, opts: InstanceRoutesOptions) {
  app.get("/v1/instances", async (request, reply) => {
    if (!opts.pool || !opts.redis) {
      reply.code(500).send({ error: "server not configured" });
      return;
    }
    const parsed = ListQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid query" });
      return;
    }
    const { q, page, page_size } = parsed.data;
    const filters: string[] = [];
    const values: Array<string | number> = [];
    if (q) {
      values.push(`%${q.toLowerCase()}%`);
      filters.push(
        `(lower(coalesce(display_name, '')) like $${values.length} or lower(name) like $${values.length})`,
      );
    }
    const whereClause = filters.length ? `where ${filters.join(" and ")}` : "";
    const countRes = await opts.pool.query(
      `select count(*)::int as total from instances ${whereClause}`,
      values,
    );
    values.push(page_size);
    values.push((page - 1) * page_size);
    const res = await opts.pool.query(
      `select id, name, display_name, last_seen_ip, updated_at, control_ui_url, skills_snapshot_at
       from instances
       ${whereClause}
       order by created_at asc, id asc
       limit $${values.length - 1}
       offset $${values.length}`,
      values,
    );
    const items = [] as Array<Record<string, unknown>>;
    for (const row of res.rows) {
      const hb = await opts.redis.get(`hb:${row.id}`);
      items.push({
        id: row.id,
        name: row.name,
        display_name: row.display_name,
        last_seen_ip: row.last_seen_ip,
        updated_at: row.updated_at,
        control_ui_url: row.control_ui_url,
        skills_snapshot_at: row.skills_snapshot_at,
        online: Boolean(hb),
      });
    }
    reply.send({ items, total: countRes.rows[0]?.total ?? 0, page, page_size });
  });

  app.get("/v1/instances/:id", async (request, reply) => {
    if (!opts.pool) {
      reply.code(500).send({ error: "server not configured" });
      return;
    }
    const { id } = request.params as { id: string };
    const res = await opts.pool.query(
      "select id, name, display_name, last_seen_ip, updated_at, control_ui_url, skills_snapshot, skills_snapshot_at from instances where id = $1",
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
      "update instances set name = coalesce($2, name), display_name = coalesce($3, display_name), control_ui_url = coalesce($4, control_ui_url), updated_at = now() where id = $1 returning id, name, display_name, control_ui_url, last_seen_ip",
      [
        id,
        parsed.data.name ?? null,
        parsed.data.display_name ?? null,
        parsed.data.control_ui_url ?? null,
      ],
    );
    if (!res.rowCount) {
      reply.code(404).send({ error: "not found" });
      return;
    }
    reply.send(res.rows[0]);
  });
}
