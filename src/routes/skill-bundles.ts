import { createHash } from "node:crypto";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";

const UploadSchema = z.object({
  name: z.string().min(1),
  format: z.literal("tar.gz").optional(),
  content_base64: z.string().min(1),
});

type SkillBundlesRoutesOptions = {
  pool?: Pool;
};

function sha256Hex(buf: Buffer) {
  return createHash("sha256").update(buf).digest("hex");
}

export async function registerSkillBundleRoutes(app: FastifyInstance, opts: SkillBundlesRoutesOptions) {
  app.get("/v1/skill-bundles", async (_req, reply) => {
    if (!opts.pool) {
      reply.code(500).send({ error: "server not configured" });
      return;
    }
    const res = await opts.pool.query(
      "select id, name, format, created_at, sha256, size_bytes from skill_bundles order by created_at desc",
    );
    reply.send({ items: res.rows });
  });

  app.post("/v1/skill-bundles", async (request, reply) => {
    if (!opts.pool) {
      reply.code(500).send({ error: "server not configured" });
      return;
    }
    const parsed = UploadSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid payload" });
      return;
    }

    const format = parsed.data.format ?? "tar.gz";
    const buf = Buffer.from(parsed.data.content_base64, "base64");
    const sha256 = sha256Hex(buf);
    const sizeBytes = buf.length;

    const res = await opts.pool.query(
      "insert into skill_bundles (name, format, sha256, size_bytes, content) values ($1,$2,$3,$4,$5) returning id, name, format, created_at, sha256, size_bytes",
      [parsed.data.name, format, sha256, sizeBytes, buf],
    );
    reply.send(res.rows[0]);
  });

  app.get("/v1/skill-bundles/:id", async (request, reply) => {
    if (!opts.pool) {
      reply.code(500).send({ error: "server not configured" });
      return;
    }
    const { id } = request.params as { id: string };
    const res = await opts.pool.query(
      "select id, name, format, created_at, sha256, size_bytes from skill_bundles where id = $1",
      [id],
    );
    if (!res.rowCount) {
      reply.code(404).send({ error: "not found" });
      return;
    }
    reply.send(res.rows[0]);
  });

  app.get("/v1/skill-bundles/:id/download", async (request, reply) => {
    if (!opts.pool) {
      reply.code(500).send({ error: "server not configured" });
      return;
    }
    const { id } = request.params as { id: string };
    const res = await opts.pool.query("select content from skill_bundles where id = $1", [id]);
    if (!res.rowCount) {
      reply.code(404).send({ error: "not found" });
      return;
    }
    reply.type("application/gzip").send(res.rows[0].content as Buffer);
  });
}

