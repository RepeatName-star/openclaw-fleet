import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";

type ArtifactsRoutesOptions = {
  pool?: Pool;
};

export async function registerArtifactsRoutes(app: FastifyInstance, opts: ArtifactsRoutesOptions) {
  app.get("/v1/artifacts/:id", async (request, reply) => {
    if (!opts.pool) {
      reply.code(500).send({ error: "server not configured" });
      return;
    }
    const { id } = request.params as { id: string };
    const res = await opts.pool.query(
      "select id, kind, created_at, expires_at, content, sha256, bytes from artifacts where id = $1",
      [id],
    );
    if (!res.rowCount) {
      reply.code(404).send({ error: "not found" });
      return;
    }
    reply.send(res.rows[0]);
  });
}

