import { Pool, type PoolClient } from "pg";

const globalForPg = globalThis as unknown as { pgPool?: Pool };

const connectionString =
  process.env.DATABASE_URL ?? "postgres://ukarts:ukarts@localhost:5432/ukarts";

/** Managed Postgres providers (Neon, Supabase, RDS, …) require TLS. */
function requiresSsl(cs: string): boolean {
  return /sslmode=require|neon\.tech|pooler\.|supabase|amazonaws|render\.com/i.test(
    cs,
  );
}

export const pool =
  globalForPg.pgPool ??
  new Pool({
    connectionString,
    max: 5,
    ssl: requiresSsl(connectionString)
      ? { rejectUnauthorized: false }
      : undefined,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPg.pgPool = pool;
}

export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const result = await pool.query(text, params as never[]);
  return result.rows as T[];
}

/** Run a set of statements inside a single transaction (BEGIN/COMMIT/ROLLBACK). */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
