import type { PoolClient } from "pg";
import { pool, query, withTransaction } from "./db";

/** Resolve the seeded admin user id (used as posted_by). */
async function getAdminUserId(client: PoolClient): Promise<string> {
  const res = await client.query(
    "SELECT id FROM master.users WHERE username = 'admin' LIMIT 1",
  );
  if (res.rows.length === 0) {
    throw new Error("Admin user is missing; run the database seed.");
  }
  return res.rows[0].id as string;
}

async function accountIdByCode(
  client: PoolClient,
  code: string,
): Promise<string> {
  const res = await client.query(
    "SELECT id FROM accounting.accounts WHERE account_code = $1",
    [code],
  );
  if (res.rows.length === 0) {
    throw new Error(`Account ${code} not found in chart of accounts.`);
  }
  return res.rows[0].id as string;
}

function docNumber(prefix: string): string {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate(),
  ).padStart(2, "0")}`;
  return `${prefix}-${stamp}-${Date.now().toString().slice(-6)}`;
}

/**
 * Create a balanced two-line journal entry from a configurable posting rule and
 * post it. Enforces Total Debits = Total Credits via accounting.post_journal_entry.
 */
async function postAutomaticJournal(
  client: PoolClient,
  opts: {
    transactionType: string;
    amount: number;
    voucherDate: string;
    voucherType: string;
    referenceType: string;
    referenceId: string;
    description: string;
    debitPartyId?: string | null;
    creditPartyId?: string | null;
  },
): Promise<string> {
  const ruleRes = await client.query(
    "SELECT debit_account_code, credit_account_code FROM accounting.posting_rules WHERE transaction_type = $1 AND active = TRUE LIMIT 1",
    [opts.transactionType],
  );
  if (ruleRes.rows.length === 0) {
    throw new Error(`No active posting rule for ${opts.transactionType}.`);
  }
  const debitAccountId = await accountIdByCode(
    client,
    ruleRes.rows[0].debit_account_code,
  );
  const creditAccountId = await accountIdByCode(
    client,
    ruleRes.rows[0].credit_account_code,
  );

  const entryRes = await client.query(
    `INSERT INTO accounting.journal_entries
       (voucher_number, voucher_date, voucher_type, reference_type, reference_id, description)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      docNumber("JV"),
      opts.voucherDate,
      opts.voucherType,
      opts.referenceType,
      opts.referenceId,
      opts.description,
    ],
  );
  const entryId = entryRes.rows[0].id as string;

  await client.query(
    `INSERT INTO accounting.journal_lines
       (journal_entry_id, line_number, account_id, party_id, debit, credit, description)
     VALUES ($1, 1, $2, $3, $4, 0, $5)`,
    [entryId, debitAccountId, opts.debitPartyId ?? null, opts.amount, opts.description],
  );
  await client.query(
    `INSERT INTO accounting.journal_lines
       (journal_entry_id, line_number, account_id, party_id, debit, credit, description)
     VALUES ($1, 2, $2, $3, 0, $4, $5)`,
    [entryId, creditAccountId, opts.creditPartyId ?? null, opts.amount, opts.description],
  );

  const adminId = await getAdminUserId(client);
  // Validates debit = credit and flips status DRAFT -> POSTED, or raises.
  await client.query("SELECT accounting.post_journal_entry($1, $2)", [
    entryId,
    adminId,
  ]);

  return entryId;
}

// ---------------------------------------------------------------------------
// Business transactions
// ---------------------------------------------------------------------------

export interface OwnerInvestmentInput {
  amount: number;
  date: string;
}

/** Owner Investment: Dr Cash/Bank, Cr Owner Investment. */
export async function recordOwnerInvestment(input: OwnerInvestmentInput) {
  if (!(input.amount > 0)) throw new Error("Amount must be greater than zero.");
  return withTransaction(async (client) => {
    const refId = (
      await client.query("SELECT gen_random_uuid() AS id")
    ).rows[0].id as string;
    const entryId = await postAutomaticJournal(client, {
      transactionType: "OWNER_INVESTMENT",
      amount: input.amount,
      voucherDate: input.date,
      voucherType: "OWNER_INVESTMENT",
      referenceType: "OWNER_INVESTMENT",
      referenceId: refId,
      description: `Owner investment of ${input.amount}`,
    });
    return { journalEntryId: entryId };
  });
}

export interface GreyPurchaseInput {
  supplierId: string;
  itemId: string;
  quantity: number;
  rate: number;
  date: string;
}

/**
 * Grey Purchase: creates purchase + lot, an inventory movement into the owner
 * grey store, and a balanced journal (Dr Grey Inventory, Cr Supplier Payable).
 * The whole flow runs in one transaction (all-or-nothing).
 */
export async function recordGreyPurchase(input: GreyPurchaseInput) {
  if (!(input.quantity > 0)) throw new Error("Quantity must be greater than zero.");
  if (!(input.rate > 0)) throw new Error("Rate must be greater than zero.");
  const amount = Number((input.quantity * input.rate).toFixed(2));

  return withTransaction(async (client) => {
    const purchaseRes = await client.query(
      `INSERT INTO inventory.grey_purchases
         (purchase_number, supplier_id, purchase_date, total_amount, status)
       VALUES ($1, $2, $3, $4, 'POSTED')
       RETURNING id`,
      [docNumber("GP"), input.supplierId, input.date, amount],
    );
    const purchaseId = purchaseRes.rows[0].id as string;

    const lineRes = await client.query(
      `INSERT INTO inventory.grey_purchase_lines
         (purchase_id, item_id, quantity, rate, amount)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [purchaseId, input.itemId, input.quantity, input.rate, amount],
    );
    const lineId = lineRes.rows[0].id as string;

    const lotRes = await client.query(
      `INSERT INTO inventory.grey_lots
         (lot_number, purchase_line_id, item_id, original_quantity, purchase_rate, original_value, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'OPEN')
       RETURNING id`,
      [docNumber("LOT"), lineId, input.itemId, input.quantity, input.rate, amount],
    );
    const lotId = lotRes.rows[0].id as string;

    const locRes = await client.query(
      "SELECT id FROM inventory.locations WHERE location_code = 'OWNER_GREY'",
    );
    if (locRes.rows.length === 0) {
      throw new Error("OWNER_GREY location missing; run the database seed.");
    }
    const ownerGreyLocationId = locRes.rows[0].id as string;

    const adminId = await getAdminUserId(client);
    const txnRes = await client.query(
      `INSERT INTO inventory.inventory_transactions
         (transaction_number, transaction_type, transaction_date, reference_type, reference_id, status, posted_at, posted_by)
       VALUES ($1, 'GREY_PURCHASE', $2, 'GREY_PURCHASE', $3, 'POSTED', NOW(), $4)
       RETURNING id`,
      [docNumber("INV"), input.date, purchaseId, adminId],
    );
    const txnId = txnRes.rows[0].id as string;

    await client.query(
      `INSERT INTO inventory.inventory_movements
         (inventory_transaction_id, movement_date, item_id, lot_id, to_location_id, quantity, rate, value)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        txnId,
        input.date,
        input.itemId,
        lotId,
        ownerGreyLocationId,
        input.quantity,
        input.rate,
        amount,
      ],
    );

    const supplierPartyRes = await client.query(
      "SELECT id FROM master.parties WHERE id = $1",
      [input.supplierId],
    );
    const supplierPartyId =
      supplierPartyRes.rows.length > 0 ? (supplierPartyRes.rows[0].id as string) : null;

    const entryId = await postAutomaticJournal(client, {
      transactionType: "GREY_PURCHASE",
      amount,
      voucherDate: input.date,
      voucherType: "GREY_PURCHASE",
      referenceType: "GREY_PURCHASE",
      referenceId: purchaseId,
      description: `Grey purchase ${input.quantity} @ ${input.rate}`,
      creditPartyId: supplierPartyId,
    });

    return { purchaseId, lotId, journalEntryId: entryId, amount };
  });
}

// ---------------------------------------------------------------------------
// Reports / reads
// ---------------------------------------------------------------------------

export interface TrialBalanceRow {
  account_code: string;
  account_name: string;
  account_type: string;
  debit: string;
  credit: string;
}

export async function getTrialBalance(): Promise<{
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
}> {
  const rows = await query<TrialBalanceRow>(
    `SELECT a.account_code, a.account_name, a.account_type,
            COALESCE(SUM(jl.debit), 0)::text  AS debit,
            COALESCE(SUM(jl.credit), 0)::text AS credit
     FROM accounting.accounts a
     JOIN accounting.journal_lines jl ON jl.account_id = a.id
     JOIN accounting.journal_entries je ON je.id = jl.journal_entry_id
     WHERE je.status = 'POSTED'
     GROUP BY a.account_code, a.account_name, a.account_type
     HAVING COALESCE(SUM(jl.debit), 0) <> 0 OR COALESCE(SUM(jl.credit), 0) <> 0
     ORDER BY a.account_code`,
  );
  const totalDebit = rows.reduce((s, r) => s + Number(r.debit), 0);
  const totalCredit = rows.reduce((s, r) => s + Number(r.credit), 0);
  return {
    rows,
    totalDebit,
    totalCredit,
    balanced: Math.abs(totalDebit - totalCredit) < 0.005,
  };
}

export interface GreyStockRow {
  location_code: string;
  location_name: string;
  item_code: string;
  item_name: string;
  lot_number: string;
  stock: string;
  value: string;
}

/** Grey stock by location/lot, computed from the inventory ledger. */
export async function getGreyStock(): Promise<GreyStockRow[]> {
  return query<GreyStockRow>(
    `SELECT l.location_code, l.location_name,
            it.item_code, it.item_name,
            gl.lot_number,
            inventory.get_location_stock(m.item_id, m.lot_id, l.id)::text AS stock,
            (inventory.get_location_stock(m.item_id, m.lot_id, l.id) * gl.purchase_rate)::numeric(18,2)::text AS value
     FROM inventory.inventory_movements m
     JOIN inventory.locations l ON l.id = m.to_location_id
     JOIN master.items it ON it.id = m.item_id
     JOIN inventory.grey_lots gl ON gl.id = m.lot_id
     GROUP BY l.id, l.location_code, l.location_name, it.item_code, it.item_name,
              gl.lot_number, m.item_id, m.lot_id
     HAVING inventory.get_location_stock(m.item_id, m.lot_id, l.id) > 0
     ORDER BY l.location_code, gl.lot_number`,
  );
}

export interface JournalEntryRow {
  voucher_number: string;
  voucher_date: string;
  voucher_type: string;
  description: string;
  status: string;
  total: string;
}

export async function getRecentJournalEntries(): Promise<JournalEntryRow[]> {
  return query<JournalEntryRow>(
    `SELECT je.voucher_number, je.voucher_date::text, je.voucher_type,
            je.description, je.status,
            COALESCE(SUM(jl.debit), 0)::text AS total
     FROM accounting.journal_entries je
     LEFT JOIN accounting.journal_lines jl ON jl.journal_entry_id = je.id
     GROUP BY je.id
     ORDER BY je.created_at DESC
     LIMIT 15`,
  );
}

export async function getSuppliers() {
  return query<{ id: string; party_code: string; party_name: string }>(
    `SELECT p.id, p.party_code, p.party_name
     FROM master.parties p
     JOIN master.party_roles r ON r.party_id = p.id
     WHERE r.role = 'GREY_SUPPLIER' AND p.status = 'ACTIVE'
     ORDER BY p.party_name`,
  );
}

export async function getGreyItems() {
  return query<{ id: string; item_code: string; item_name: string }>(
    `SELECT id, item_code, item_name
     FROM master.items
     WHERE item_type = 'GREY_CLOTH' AND status = 'ACTIVE'
     ORDER BY item_name`,
  );
}

export async function healthCheck(): Promise<{ ok: boolean; now: string }> {
  const res = await pool.query("SELECT NOW()::text AS now");
  return { ok: true, now: res.rows[0].now as string };
}
