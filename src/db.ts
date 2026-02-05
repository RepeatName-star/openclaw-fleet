import { Pool } from "pg";

export function createPool(databaseUrl: string) {
  return new Pool({ connectionString: databaseUrl });
}
