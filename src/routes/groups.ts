import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { matchLabelSelector, parseLabelSelector } from "../labels/label-selector.js";

const CreateGroupSchema = z.object({
  name: z.string().min(1),
  selector: z.string().min(1),
  description: z.string().optional(),
});

const PatchGroupSchema = z.object({
  name: z.string().min(1).optional(),
  selector: z.string().min(1).optional(),
  description: z.string().optional(),
});

type GroupsRoutesOptions = {
  pool?: Pool;
};

export async function registerGroupsRoutes(app: FastifyInstance, opts: GroupsRoutesOptions) {
  app.get("/v1/groups", async (_request, reply) => {
    if (!opts.pool) {
      reply.code(500).send({ error: "server not configured" });
      return;
    }
    const res = await opts.pool.query(
      "select id, name, selector, description, created_at, updated_at from groups order by created_at asc",
    );
    reply.send({ items: res.rows });
  });

  app.post("/v1/groups", async (request, reply) => {
    if (!opts.pool) {
      reply.code(500).send({ error: "server not configured" });
      return;
    }
    const parsed = CreateGroupSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid payload" });
      return;
    }

    const selectorParsed = parseLabelSelector(parsed.data.selector);
    if (selectorParsed.error) {
      reply.code(400).send({ error: "invalid selector" });
      return;
    }

    const res = await opts.pool.query(
      "insert into groups (name, selector, description, updated_at) values ($1, $2, $3, now()) returning id, name, selector, description, created_at, updated_at",
      [parsed.data.name, parsed.data.selector, parsed.data.description ?? null],
    );
    reply.send(res.rows[0]);
  });

  app.get("/v1/groups/:id", async (request, reply) => {
    if (!opts.pool) {
      reply.code(500).send({ error: "server not configured" });
      return;
    }
    const { id } = request.params as { id: string };
    const res = await opts.pool.query(
      "select id, name, selector, description, created_at, updated_at from groups where id = $1",
      [id],
    );
    if (!res.rowCount) {
      reply.code(404).send({ error: "not found" });
      return;
    }
    reply.send(res.rows[0]);
  });

  app.patch("/v1/groups/:id", async (request, reply) => {
    if (!opts.pool) {
      reply.code(500).send({ error: "server not configured" });
      return;
    }
    const parsed = PatchGroupSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid payload" });
      return;
    }
    const { id } = request.params as { id: string };

    if (parsed.data.selector) {
      const selectorParsed = parseLabelSelector(parsed.data.selector);
      if (selectorParsed.error) {
        reply.code(400).send({ error: "invalid selector" });
        return;
      }
    }

    const res = await opts.pool.query(
      "update groups set name = coalesce($2, name), selector = coalesce($3, selector), description = coalesce($4, description), updated_at = now() where id = $1 returning id, name, selector, description, created_at, updated_at",
      [id, parsed.data.name ?? null, parsed.data.selector ?? null, parsed.data.description ?? null],
    );
    if (!res.rowCount) {
      reply.code(404).send({ error: "not found" });
      return;
    }
    reply.send(res.rows[0]);
  });

  app.delete("/v1/groups/:id", async (request, reply) => {
    if (!opts.pool) {
      reply.code(500).send({ error: "server not configured" });
      return;
    }
    const { id } = request.params as { id: string };
    const res = await opts.pool.query("delete from groups where id = $1 returning id", [id]);
    if (!res.rowCount) {
      reply.code(404).send({ error: "not found" });
      return;
    }
    reply.send({ ok: true });
  });

  app.get("/v1/groups/:id/matches", async (request, reply) => {
    if (!opts.pool) {
      reply.code(500).send({ error: "server not configured" });
      return;
    }
    const { id } = request.params as { id: string };
    const group = await opts.pool.query("select id, selector from groups where id = $1", [id]);
    if (!group.rowCount) {
      reply.code(404).send({ error: "not found" });
      return;
    }
    const selectorStr = group.rows[0].selector as string;
    const parsed = parseLabelSelector(selectorStr ?? "");
    if (parsed.error) {
      reply.code(500).send({ error: "invalid selector stored" });
      return;
    }

    const instances = await opts.pool.query("select id, name from instances order by created_at asc");
    const labelsRes = await opts.pool.query(
      "select instance_id, key, value from instance_labels order by key asc",
    );
    const byInstance = new Map<string, Record<string, string>>();
    for (const row of labelsRes.rows) {
      const iid = row.instance_id as string;
      const map = byInstance.get(iid) ?? {};
      map[row.key as string] = String(row.value ?? "");
      byInstance.set(iid, map);
    }

    const items = [] as Array<{ id: string; name: string }>;
    for (const inst of instances.rows) {
      const labels = byInstance.get(inst.id as string) ?? {};
      if (matchLabelSelector(parsed.selector, labels)) {
        items.push({ id: inst.id as string, name: inst.name as string });
      }
    }
    reply.send({ items });
  });
}

