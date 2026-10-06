// Shared Postgres helpers for the maintenance scripts.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

export const DEFAULT_URL = "postgres://ukarts:ukarts@localhost:5432/ukarts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Managed Postgres providers (Neon, Supabase, RDS, …) require TLS. */
function requiresSsl(cs) {
  return /sslmode=require|neon\.tech|pooler\.|supabase|amazonaws|render\.com/i.test(
    cs,
  );
}

export async function connect(
  connectionString = process.env.DATABASE_URL ?? DEFAULT_URL,
) {
  const client = new pg.Client({
    connectionString,
    ssl: requiresSsl(connectionString) ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  return client;
}

/** Read one of the SQL files in db/. */
export function readSql(name) {
  return readFile(join(root, "db", name), "utf8");
}
