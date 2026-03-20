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
      conditions.push(
        `(e.task_id::text = $${idx} or (e.task_id is null and e.payload->>'task_id' = $${idx}))`,
      );
      args.push(parsed.data.task_id);
      idx += 1;
    }
    if (parsed.data.campaign_id) {
      conditions.push(`e.campaign_id = $${idx++}`);
      args.push(parsed.data.campaign_id);
    }
    if (parsed.data.instance_id) {
      conditions.push(`e.instance_id = $${idx++}`);
      args.push(parsed.data.instance_id);
    }
    if (parsed.data.event_type) {
      conditions.push(`e.event_type = $${idx++}`);
      args.push(parsed.data.event_type);
    }
    const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
    const page = parsed.data.page ?? 1;
    const pageSize = parsed.data.page_size ?? parsed.data.limit ?? 10;
    const countRes = await opts.pool.query(
      `select count(*)::int as total from events e ${where}`,
      args,
    );
    args.push(pageSize);
    args.push((page - 1) * pageSize);

    const res = await opts.pool.query(
      `select e.id, e.event_type, e.ts, coalesce(e.task_id::text, e.payload->>'task_id') as task_id, e.campaign_id, e.campaign_generation, e.instance_id, e.instance_name, i.display_name as instance_display_name, e.labels_snapshot, e.facts_snapshot, e.payload, e.artifact_id
       from events e
       left join instances i on i.id = e.instance_id
       ${where}
       order by e.ts desc, e.id desc
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
      conditions.push(
        `(e.task_id::text = $${idx} or (e.task_id is null and e.payload->>'task_id' = $${idx}))`,
      );
      args.push(parsed.data.task_id);
      idx += 1;
    }
    if (parsed.data.campaign_id) {
      conditions.push(`e.campaign_id = $${idx++}`);
      args.push(parsed.data.campaign_id);
    }
    if (parsed.data.instance_id) {
      conditions.push(`e.instance_id = $${idx++}`);
      args.push(parsed.data.instance_id);
    }
    if (parsed.data.event_type) {
      conditions.push(`e.event_type = $${idx++}`);
      args.push(parsed.data.event_type);
    }
    const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
    const res = await opts.pool.query(
      `select e.ts, e.event_type, coalesce(e.task_id::text, e.payload->>'task_id') as task_id, e.campaign_id, e.campaign_generation, e.instance_id, e.instance_name, i.display_name as instance_display_name, e.labels_snapshot, e.facts_snapshot, e.artifact_id, e.payload
       from events e
       left join instances i on i.id = e.instance_id
       ${where}
       order by e.ts asc`,
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
        "instance_display_name",
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
          csvEscape(r.instance_display_name),
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
