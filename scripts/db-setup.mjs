#!/usr/bin/env node
// Apply the schema and seed to the database referenced by DATABASE_URL.
// Idempotent: safe to run on every environment start. Pass --reset to drop
// and recreate all application schemas first.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const reset = process.argv.includes("--reset");
const ifConfigured = process.argv.includes("--if-configured");

// In --if-configured mode (used by the Vercel build) we only run when an
// explicit DATABASE_URL is present, so a first build before the database is
// provisioned still succeeds.
if (ifConfigured && !process.env.DATABASE_URL) {
  console.log("DATABASE_URL not set; skipping schema setup.");
  process.exit(0);
}

const connectionString =
  process.env.DATABASE_URL ?? "postgres://ukarts:ukarts@localhost:5432/ukarts";

function requiresSsl(cs) {
  return /sslmode=require|neon\.tech|pooler\.|supabase|amazonaws|render\.com/i.test(
    cs,
  );
}

async function main() {
  const client = new pg.Client({
    connectionString,
    ssl: requiresSsl(connectionString) ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  try {
    if (reset) {
      console.log("Dropping application schemas…");
      await client.query(`
        DROP SCHEMA IF EXISTS audit CASCADE;
        DROP SCHEMA IF EXISTS accounting CASCADE;
        DROP SCHEMA IF EXISTS production CASCADE;
        DROP SCHEMA IF EXISTS inventory CASCADE;
        DROP SCHEMA IF EXISTS sales CASCADE;
        DROP SCHEMA IF EXISTS master CASCADE;
      `);
    }

    const schema = await readFile(join(root, "db", "schema.sql"), "utf8");
    console.log("Applying schema…");
    await client.query(schema);

    const seed = await readFile(join(root, "db", "seed.sql"), "utf8");
    console.log("Applying seed…");
    await client.query(seed);

    const { rows } = await client.query(
      "SELECT count(*)::int AS n FROM accounting.accounts",
    );
    console.log(`Done. Chart of accounts has ${rows[0].n} accounts.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("db-setup failed:", err.message);
  process.exit(1);
});
