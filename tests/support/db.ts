import fs from "node:fs/promises";
import path from "node:path";
import { newDb } from "pg-mem";

export function initTestDb() {
  const db = newDb({ autoCreateForeignKeyIndices: true });
  let uuidSeq = 0;
  db.public.registerFunction({
    name: "gen_random_uuid",
    returns: "uuid",
    impure: true,
    implementation: () => {
      uuidSeq += 1;
      const suffix = uuidSeq.toString(16).padStart(12, "0");
      return `00000000-0000-0000-0000-${suffix}`;
    },
  });
  return db;
}

export function createTestPool(db: ReturnType<typeof initTestDb>) {
  const adapter = db.adapters.createPg();
  return new adapter.Pool();
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
