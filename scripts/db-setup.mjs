#!/usr/bin/env node
// Apply the schema and seed to the database referenced by DATABASE_URL.
// Idempotent: safe to run on every environment start. Pass --reset to drop
// and recreate all application schemas first.
import { connect, readSql } from "./pg-client.mjs";

const reset = process.argv.includes("--reset");
const ifConfigured = process.argv.includes("--if-configured");

// In --if-configured mode (used by the Vercel build) we only run when an
// explicit DATABASE_URL is present, so a first build before the database is
// provisioned still succeeds.
if (ifConfigured && !process.env.DATABASE_URL) {
  console.log("DATABASE_URL not set; skipping schema setup.");
  process.exit(0);
}

async function main() {
  const client = await connect();
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

    console.log("Applying schema…");
    await client.query(await readSql("schema.sql"));

    console.log("Applying seed…");
    await client.query(await readSql("seed.sql"));

    const { rows: accounts } = await client.query(
      "SELECT count(*)::int AS n FROM accounting.accounts",
    );
    const { rows: parties } = await client.query(
      "SELECT count(*)::int AS n FROM master.parties",
    );
    const { rows: items } = await client.query(
      "SELECT count(*)::int AS n FROM master.items",
    );
    const { rows: journals } = await client.query(
      "SELECT count(*)::int AS n FROM accounting.journal_entries",
    );
    console.log(
      `Done. COA ${accounts[0].n} accounts; parties ${parties[0].n}; items ${items[0].n}; journals ${journals[0].n}.`,
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("db-setup failed:", err.message);
  process.exit(1);
});
