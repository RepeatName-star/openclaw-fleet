import fs from "node:fs/promises";
import path from "node:path";
import { newDb } from "pg-mem";

export function initTestDb() {
  const db = newDb({ autoCreateForeignKeyIndices: true });
  db.public.registerFunction({
    name: "gen_random_uuid",
    returns: "uuid",
    implementation: () => "00000000-0000-0000-0000-000000000000",
  });
  return db;
}

export async function runMigrations(db: ReturnType<typeof initTestDb>) {
  const dir = path.join(process.cwd(), "migrations");
  const entries = await fs.readdir(dir);
  const files = entries.filter((entry) => entry.endsWith(".sql")).sort();
  for (const file of files) {
    let sql = await fs.readFile(path.join(dir, file), "utf-8");
    sql = sql.replace(/CREATE EXTENSION[^;]+;\s*/gi, "");
    db.public.query(sql);
  }
}
