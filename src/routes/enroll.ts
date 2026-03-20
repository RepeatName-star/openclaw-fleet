import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { AppConfig } from "../config.js";
import { issueDeviceToken } from "../auth.js";

const EnrollSchema = z.object({
  enrollment_token: z.string().min(1),
  instance_name: z.string().min(1),
});

type EnrollOptions = {
  config?: AppConfig;
  pool?: Pool;
};

export async function registerEnrollRoutes(app: FastifyInstance, opts: EnrollOptions) {
  app.post("/v1/enroll", async (request, reply) => {
    if (!opts.config || !opts.pool) {
      reply.code(500).send({ error: "server not configured" });
      return;
    }
    const parsed = EnrollSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid payload" });
      return;
    }
    if (parsed.data.enrollment_token !== opts.config.enrollmentSecret) {
      reply.code(401).send({ error: "invalid enrollment token" });
      return;
    }

    const instanceName = parsed.data.instance_name.trim();
    const lastSeenIp = request.ip ?? null;
    const existing = await opts.pool.query(
      "select id from instances where name = $1 limit 1",
      [instanceName],
    );
    let instanceId: string;
    if (existing.rowCount && existing.rows[0]?.id) {
      instanceId = existing.rows[0].id as string;
      await opts.pool.query(
        "update instances set last_seen_ip = $2, updated_at = now() where id = $1",
        [instanceId, lastSeenIp],
      );
    } else {
      const created = await opts.pool.query(
        "insert into instances (name, last_seen_ip) values ($1, $2) returning id",
        [instanceName, lastSeenIp],
      );
      instanceId = created.rows[0].id as string;
    }

    const deviceToken = await issueDeviceToken(opts.pool, {
      instanceId,
      scopes: ["operator.admin"],
    });

    reply.send({ ok: true, instance_id: instanceId, device_token: deviceToken });
  });
}
