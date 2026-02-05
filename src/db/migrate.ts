import fs from "node:fs/promises";
import path from "node:path";
import type { Pool } from "pg";

export async function runMigrations(pool: Pool, migrationsDir?: string) {
  const dir = migrationsDir ?? path.join(process.cwd(), "migrations");
  const entries = await fs.readdir(dir);
  const files = entries.filter((entry) => entry.endsWith(".sql")).sort();
  if (files.length === 0) {
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const file of files) {
      const sql = await fs.readFile(path.join(dir, file), "utf-8");
      await client.query(sql);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
