import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";

const ListQuerySchema = z.object({
  task_id: z.string().min(1).optional(),
  campaign_id: z.string().min(1).optional(),
  instance_id: z.string().min(1).optional(),
  event_type: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  page: z.coerce.number().int().min(1).optional(),
  page_size: z.coerce.number().int().min(1).max(100).optional(),
});

const ExportQuerySchema = ListQuerySchema.extend({
  format: z.enum(["jsonl", "csv"]).optional(),
});

type EventsRoutesOptions = {
  pool?: Pool;
};

function csvEscape(value: unknown) {
  const s = value === null || value === undefined ? "" : String(value);
  if (!/[",\n\r]/.test(s)) {
    return s;
  }
  return `"${s.replaceAll("\"", "\"\"")}"`;
}

export async function registerEventsRoutes(app: FastifyInstance, opts: EventsRoutesOptions) {
  app.get("/v1/events", async (request, reply) => {
    if (!opts.pool) {
      reply.code(500).send({ error: "server not configured" });
      return;
    }
    const parsed = ListQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid query" });
      return;
    }

    const conditions: string[] = [];
    const args: unknown[] = [];
    let idx = 1;
    if (parsed.data.task_id) {
      conditions.push(`(task_id::text = $${idx} or (task_id is null and payload->>'task_id' = $${idx}))`);
      args.push(parsed.data.task_id);
      idx += 1;
    }
    if (parsed.data.campaign_id) {
      conditions.push(`campaign_id = $${idx++}`);
      args.push(parsed.data.campaign_id);
    }
    if (parsed.data.instance_id) {
      conditions.push(`instance_id = $${idx++}`);
      args.push(parsed.data.instance_id);
    }
    if (parsed.data.event_type) {
      conditions.push(`event_type = $${idx++}`);
      args.push(parsed.data.event_type);
    }
    const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
    const page = parsed.data.page ?? 1;
    const pageSize = parsed.data.page_size ?? parsed.data.limit ?? 10;
    const countRes = await opts.pool.query(
      `select count(*)::int as total from events ${where}`,
      args,
    );
    args.push(pageSize);
    args.push((page - 1) * pageSize);

    const res = await opts.pool.query(
      `select id, event_type, ts, coalesce(task_id::text, payload->>'task_id') as task_id, campaign_id, campaign_generation, instance_id, instance_name, labels_snapshot, facts_snapshot, payload, artifact_id
       from events
       ${where}
       order by ts desc, id desc
       limit $${idx}
       offset $${idx + 1}`,
      args,
    );
    reply.send({
      items: res.rows,
      total: countRes.rows[0]?.total ?? 0,
      page,
      page_size: pageSize,
    });
  });

  app.get("/v1/events/export", async (request, reply) => {
    if (!opts.pool) {
      reply.code(500).send({ error: "server not configured" });
      return;
    }
    const parsed = ExportQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid query" });
      return;
    }

    const conditions: string[] = [];
    const args: unknown[] = [];
    let idx = 1;
    if (parsed.data.task_id) {
      conditions.push(`(task_id::text = $${idx} or (task_id is null and payload->>'task_id' = $${idx}))`);
      args.push(parsed.data.task_id);
      idx += 1;
    }
    if (parsed.data.campaign_id) {
      conditions.push(`campaign_id = $${idx++}`);
      args.push(parsed.data.campaign_id);
    }
    if (parsed.data.instance_id) {
      conditions.push(`instance_id = $${idx++}`);
      args.push(parsed.data.instance_id);
    }
    if (parsed.data.event_type) {
      conditions.push(`event_type = $${idx++}`);
      args.push(parsed.data.event_type);
    }
    const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
    const res = await opts.pool.query(
      `select ts, event_type, coalesce(task_id::text, payload->>'task_id') as task_id, campaign_id, campaign_generation, instance_id, instance_name, labels_snapshot, facts_snapshot, artifact_id, payload from events ${where} order by ts asc`,
      args,
    );

    const format = parsed.data.format ?? "jsonl";
    if (format === "csv") {
      const header = [
        "ts",
        "event_type",
        "task_id",
        "campaign_id",
        "campaign_generation",
        "instance_id",
        "instance_name",
        "labels_snapshot",
        "facts_snapshot",
        "artifact_id",
        "payload",
      ].join(",");
      const lines = res.rows.map((r: any) =>
        [
          csvEscape(r.ts),
          csvEscape(r.event_type),
          csvEscape(r.task_id),
          csvEscape(r.campaign_id),
          csvEscape(r.campaign_generation),
          csvEscape(r.instance_id),
          csvEscape(r.instance_name),
          csvEscape(JSON.stringify(r.labels_snapshot ?? {})),
          csvEscape(JSON.stringify(r.facts_snapshot ?? null)),
          csvEscape(r.artifact_id),
          csvEscape(JSON.stringify(r.payload ?? {})),
        ].join(","),
      );
      reply.type("text/csv").send([header, ...lines].join("\n") + "\n");
      return;
    }

    const body = res.rows.map((r: any) => JSON.stringify(r)).join("\n");
    reply.type("application/json").send(body.length ? body + "\n" : "");
  });
}
