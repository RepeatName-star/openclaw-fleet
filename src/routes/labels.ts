import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { validateK8sLabelKey, validateK8sLabelValue } from "../labels/k8s-labels.js";

const UpsertLabelSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
});

const DeleteLabelQuerySchema = z.object({
  key: z.string().min(1),
});

type LabelsRoutesOptions = {
  pool?: Pool;
};

function isBusinessLabelKey(key: string) {
  return key.startsWith("biz.openclaw.io/");
}

function isSystemLabelKey(key: string) {
  return key.startsWith("openclaw.io/");
}

function normalizeRouteKey(rawKey: string) {
  try {
    return decodeURIComponent(rawKey);
  } catch {
    return rawKey;
  }
}

export async function registerLabelsRoutes(app: FastifyInstance, opts: LabelsRoutesOptions) {
  app.get("/v1/instances/:id/labels", async (request, reply) => {
    if (!opts.pool) {
      reply.code(500).send({ error: "server not configured" });
      return;
    }
    const { id } = request.params as { id: string };
    const exists = await opts.pool.query("select 1 from instances where id = $1", [id]);
    if (!exists.rowCount) {
      reply.code(404).send({ error: "not found" });
      return;
    }

    const res = await opts.pool.query(
      "select key, value, source, updated_at from instance_labels where instance_id = $1 order by key asc",
      [id],
    );
    reply.send({ items: res.rows });
  });

  app.post("/v1/instances/:id/labels", async (request, reply) => {
    if (!opts.pool) {
      reply.code(500).send({ error: "server not configured" });
      return;
    }
    const parsed = UpsertLabelSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid payload" });
      return;
    }

    const { id } = request.params as { id: string };
    const { key, value } = parsed.data;

    if (isSystemLabelKey(key)) {
      reply.code(400).send({ error: "system labels are read-only" });
      return;
    }
    if (!isBusinessLabelKey(key)) {
      reply.code(400).send({ error: "business label key must use biz.openclaw.io/* prefix" });
      return;
    }

    const keyRes = validateK8sLabelKey(key);
    if (!keyRes.ok) {
      reply.code(400).send({ error: "invalid label key" });
      return;
    }
    const valueRes = validateK8sLabelValue(value);
    if (!valueRes.ok) {
      reply.code(400).send({ error: "invalid label value" });
      return;
    }

    const exists = await opts.pool.query("select 1 from instances where id = $1", [id]);
    if (!exists.rowCount) {
      reply.code(404).send({ error: "not found" });
      return;
    }

    await opts.pool.query(
      "insert into instance_labels (instance_id, key, value, source) values ($1, $2, $3, 'business') on conflict (instance_id, key) do update set value = excluded.value, source = excluded.source, updated_at = now()",
      [id, key, value],
    );

    reply.send({ ok: true });
  });

  async function handleDelete(instanceId: string, rawKey: string, reply: any) {
    if (!opts.pool) {
      reply.code(500).send({ error: "server not configured" });
      return;
    }
    const key = normalizeRouteKey(rawKey);

    if (isSystemLabelKey(key)) {
      reply.code(400).send({ error: "system labels are read-only" });
      return;
    }
    if (!isBusinessLabelKey(key)) {
      reply.code(400).send({ error: "business label key must use biz.openclaw.io/* prefix" });
      return;
    }

    const exists = await opts.pool.query("select 1 from instances where id = $1", [instanceId]);
    if (!exists.rowCount) {
      reply.code(404).send({ error: "not found" });
      return;
    }

    const res = await opts.pool.query(
      "delete from instance_labels where instance_id = $1 and key = $2 and source = 'business' returning key",
      [instanceId, key],
    );
    if (!res.rowCount) {
      reply.code(404).send({ error: "not found" });
      return;
    }
    reply.send({ ok: true });
  }

  app.delete("/v1/instances/:id/labels", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = DeleteLabelQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid query" });
      return;
    }
    await handleDelete(id, parsed.data.key, reply);
  });

  app.delete("/v1/instances/:id/labels/:key", async (request, reply) => {
    const { id, key } = request.params as { id: string; key: string };
    await handleDelete(id, key, reply);
  });
}
