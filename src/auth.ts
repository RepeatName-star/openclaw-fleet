import { randomUUID } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "pg";

declare module "fastify" {
  interface FastifyRequest {
    device?: {
      instanceId: string;
      scopes: string[];
    };
  }
}

export async function requireDeviceToken(
  pool: Pool,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const header = request.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    reply.code(401).send({ error: "missing token" });
    return;
  }
  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    reply.code(401).send({ error: "missing token" });
    return;
  }
  const result = await pool.query(
    "select instance_id, scopes from device_tokens where token = $1 and revoked_at is null",
    [token],
  );
  if (!result.rowCount) {
    reply.code(401).send({ error: "invalid token" });
    return;
  }
  request.device = {
    instanceId: result.rows[0].instance_id as string,
    scopes: (result.rows[0].scopes as string[]) ?? [],
  };
}

export async function issueDeviceToken(
  pool: Pool,
  params: { instanceId: string; scopes: string[] },
) {
  const token = randomUUID();
  await pool.query(
    "insert into device_tokens (token, instance_id, scopes) values ($1, $2, $3)",
    [token, params.instanceId, params.scopes],
  );
  return token;
}
