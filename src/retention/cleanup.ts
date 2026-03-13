import type { Pool } from "pg";

export async function runRetentionCleanup(pool: Pool): Promise<void> {
  await pool.query("delete from events where ts < now() - interval '90 days'");
  await pool.query("delete from artifacts where expires_at < now()");
}

