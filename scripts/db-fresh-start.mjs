#!/usr/bin/env node
// Restore the database referenced by DATABASE_URL to a fresh start: delete the
// entries recorded while testing and keep the reference data (chart of
// accounts, posting rules, units, store locations, company profile, logins).
//
//   npm run db:fresh-start                        # report only, deletes nothing
//   npm run db:fresh-start -- --yes               # clear documents and masters
//   npm run db:fresh-start -- --yes --keep-masters  # keep parties/items/designs
//
// Unlike `db:reset`, the schema is never dropped, so the database stays usable
// for a client who is already signed in.
import { connect, readSql } from "./pg-client.mjs";

const confirmed = process.argv.includes("--yes");
const keepMasters = process.argv.includes("--keep-masters");

const FOOTPRINT = `
  SELECT
    (SELECT COUNT(*) FROM accounting.journal_entries)::int    AS "journal vouchers",
    (SELECT COUNT(*) FROM inventory.inventory_movements)::int AS "inventory movements",
    (SELECT COUNT(*) FROM inventory.grey_purchases)::int      AS "grey purchases",
    (SELECT COUNT(*) FROM inventory.grey_lots)::int           AS "grey lots",
    (SELECT COUNT(*) FROM sales.sale_orders)::int             AS "sale orders",
    (SELECT COUNT(*) FROM production.production_orders)::int  AS "production orders",
    (SELECT COUNT(*) FROM production.processing_orders)::int  AS "processing orders",
    (SELECT COUNT(*) FROM production.stitching_orders)::int   AS "stitching orders",
    (SELECT COUNT(*) FROM master.document_files)::int         AS attachments,
    (SELECT COUNT(*) FROM master.parties)::int                AS parties,
    (SELECT COUNT(*) FROM master.items)::int                  AS items,
    (SELECT COUNT(*) FROM master.designs)::int                AS designs
`;

async function main() {
  const client = await connect();
  try {
    // The function lives in the schema file, so make sure it is current.
    await client.query(await readSql("schema.sql"));

    const { rows: before } = await client.query(FOOTPRINT);
    console.log("Current contents:");
    console.table(before[0]);

    if (!confirmed) {
      console.log(
        "Nothing deleted. Re-run with --yes to clear these entries" +
          (keepMasters ? "" : " (add --keep-masters to keep parties/items/designs)") +
          ".",
      );
      return;
    }

    const { rows } = await client.query("SELECT master.fresh_start($1) AS cleared", [
      keepMasters,
    ]);
    console.log(`Deleted (keep-masters: ${keepMasters}):`);
    console.table(rows[0].cleared);

    // Same stamp the Settings card shows after a reset from the app.
    await client.query(
      `INSERT INTO master.app_meta (key, value) VALUES ('last_fresh_start', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [
        JSON.stringify({
          at: new Date().toISOString(),
          by: "db:fresh-start",
          scope: keepMasters ? "ENTRIES" : "ENTRIES_AND_MASTERS",
        }),
      ],
    );

    // Re-apply the seed so any reference data is present for the fresh start.
    console.log("Restoring reference data…");
    await client.query(await readSql("seed.sql"));

    const { rows: after } = await client.query(FOOTPRINT);
    console.log("Contents after fresh start:");
    console.table(after[0]);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("db-fresh-start failed:", err.message);
  process.exit(1);
});
