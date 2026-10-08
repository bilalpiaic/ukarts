import type { PoolClient } from "pg";
import { pool, query, withTransaction } from "./db";
import {
  cashBankForType,
  expandCashBankLines,
  formModeForType,
  isBankAccount,
  isCashAccount,
  isManualVoucherType,
  normalizeManualVoucherType,
  type FilterableAccount,
  type ManualVoucherType,
} from "./vouchers";
import {
  buildDispatchSalesJournal,
  buildManualSalesJournal,
  customerClosingBalance,
  receivableOnInvoice,
  SALES_ACCOUNTS,
  type SalesPaymentType,
} from "./sales-invoice";

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

/** Next `{PREFIX}-000001` from the shared sequence table (vouchers, DO, invoices). */
async function nextSeriesNumber(client: PoolClient, prefix: string): Promise<string> {
  const res = await client.query<{ seq: number }>(
    `INSERT INTO accounting.voucher_sequences (voucher_type, next_number)
     VALUES ($1, 2)
     ON CONFLICT (voucher_type) DO UPDATE
       SET next_number = accounting.voucher_sequences.next_number + 1
     RETURNING next_number - 1 AS seq`,
    [prefix],
  );
  return `${prefix}-${String(Number(res.rows[0].seq)).padStart(6, "0")}`;
}

/** Next `{TYPE}-000001` number for a manual voucher series (Easy-Books style). */
async function nextVoucherNumber(client: PoolClient, type: string): Promise<string> {
  const vtype = isManualVoucherType(type) ? type : "JV";
  return nextSeriesNumber(client, vtype);
}

async function assertTreasuryAccount(
  client: PoolClient,
  voucherType: ManualVoucherType,
  treasuryAccountCode: string | null | undefined,
) {
  const kind = cashBankForType(voucherType);
  if (!kind) return;
  if (!treasuryAccountCode) {
    throw new Error(
      kind === "cash"
        ? "Select a Cash in Hand account."
        : "Select a Bank account.",
    );
  }
  const res = await client.query<FilterableAccount>(
    `SELECT account_code, account_name, account_type, cash_bank
     FROM accounting.accounts WHERE account_code = $1`,
    [treasuryAccountCode],
  );
  const account = res.rows[0];
  if (!account) throw new Error(`Account ${treasuryAccountCode} not found in chart of accounts.`);
  if (kind === "cash" && !isCashAccount(account)) {
    throw new Error("Cash Payment / Cash Receipt must use a Cash in Hand account.");
  }
  if (kind === "bank" && !isBankAccount(account)) {
    throw new Error("Bank Payment / Bank Receipt must use a Bank account.");
  }
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

export interface GreyPurchaseLineInput {
  itemId: string;
  quantity: number;
  rate: number;
}

export interface GreyPurchaseInput {
  supplierId: string;
  date: string;
  /** Single-line shape (kept for backward compatibility). */
  itemId?: string;
  quantity?: number;
  rate?: number;
  /** Multi-line shape — enter several grey items on one purchase. */
  lines?: GreyPurchaseLineInput[];
}

/**
 * Grey Purchase: creates a purchase with one or more item lines, a grey lot and
 * inventory movement per line into the owner grey store, and a single balanced
 * journal (Dr Grey Inventory, Cr Supplier Payable) for the purchase total.
 * The whole flow runs in one transaction (all-or-nothing).
 */
export async function recordGreyPurchase(input: GreyPurchaseInput) {
  const rawLines: GreyPurchaseLineInput[] =
    input.lines && input.lines.length > 0
      ? input.lines
      : [{ itemId: input.itemId as string, quantity: input.quantity as number, rate: input.rate as number }];

  const lines = rawLines
    .map((l) => ({ itemId: l.itemId, quantity: Number(l.quantity), rate: Number(l.rate) }))
    .filter((l) => l.itemId && l.quantity > 0 && l.rate > 0);

  if (lines.length === 0) {
    throw new Error("Enter at least one grey line with an item, quantity and rate.");
  }

  const total = round2(lines.reduce((s, l) => s + l.quantity * l.rate, 0));

  return withTransaction(async (client) => {
    const purchaseRes = await client.query(
      `INSERT INTO inventory.grey_purchases
         (purchase_number, supplier_id, purchase_date, total_amount, status)
       VALUES ($1, $2, $3, $4, 'POSTED')
       RETURNING id`,
      [docNumber("GP"), input.supplierId, input.date, total],
    );
    const purchaseId = purchaseRes.rows[0].id as string;

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

    const lotIds: string[] = [];
    for (const l of lines) {
      const amount = round2(l.quantity * l.rate);
      const lineRes = await client.query(
        `INSERT INTO inventory.grey_purchase_lines
           (purchase_id, item_id, quantity, rate, amount)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [purchaseId, l.itemId, l.quantity, l.rate, amount],
      );
      const lineId = lineRes.rows[0].id as string;
      const lotRes = await client.query(
        `INSERT INTO inventory.grey_lots
           (lot_number, purchase_line_id, item_id, original_quantity, purchase_rate, original_value, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'OPEN') RETURNING id`,
        [docNumber("LOT"), lineId, l.itemId, l.quantity, l.rate, amount],
      );
      const lotId = lotRes.rows[0].id as string;
      lotIds.push(lotId);
      await client.query(
        `INSERT INTO inventory.inventory_movements
           (inventory_transaction_id, movement_date, item_id, lot_id, to_location_id, quantity, rate, value)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [txnId, input.date, l.itemId, lotId, ownerGreyLocationId, l.quantity, l.rate, amount],
      );
    }

    const entryId = await postAutomaticJournal(client, {
      transactionType: "GREY_PURCHASE",
      amount: total,
      voucherDate: input.date,
      voucherType: "GREY_PURCHASE",
      referenceType: "GREY_PURCHASE",
      referenceId: purchaseId,
      description: `Grey purchase — ${lines.length} line(s), total ${total}`,
      creditPartyId: input.supplierId,
    });

    return { purchaseId, lotIds, journalEntryId: entryId, amount: total, lines: lines.length };
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

export interface DateRange {
  from?: string;
  to?: string;
}

/** Build a "voucher_date BETWEEN" clause starting at parameter index `start`. */
function dateClause(range: DateRange | undefined, start: number) {
  const clauses: string[] = [];
  const params: string[] = [];
  let i = start;
  if (range?.from) {
    clauses.push(`je.voucher_date >= $${i++}`);
    params.push(range.from);
  }
  if (range?.to) {
    clauses.push(`je.voucher_date <= $${i++}`);
    params.push(range.to);
  }
  return { sql: clauses.length ? " AND " + clauses.join(" AND ") : "", params };
}

export async function getTrialBalance(range?: DateRange): Promise<{
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
}> {
  const dc = dateClause(range, 1);
  const rows = await query<TrialBalanceRow>(
    `SELECT a.account_code, a.account_name, a.account_type,
            COALESCE(SUM(jl.debit), 0)::text  AS debit,
            COALESCE(SUM(jl.credit), 0)::text AS credit
     FROM accounting.accounts a
     JOIN accounting.journal_lines jl ON jl.account_id = a.id
     JOIN accounting.journal_entries je ON je.id = jl.journal_entry_id
     WHERE je.status = 'POSTED'${dc.sql}
     GROUP BY a.account_code, a.account_name, a.account_type
     HAVING COALESCE(SUM(jl.debit), 0) <> 0 OR COALESCE(SUM(jl.credit), 0) <> 0
     ORDER BY a.account_code`,
    dc.params,
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
              gl.lot_number, gl.purchase_rate, m.item_id, m.lot_id
     HAVING inventory.get_location_stock(m.item_id, m.lot_id, l.id) > 0
     ORDER BY l.location_code, gl.lot_number`,
  );
}

export interface JournalEntryRow {
  id: string;
  voucher_number: string;
  voucher_date: string;
  voucher_type: string;
  description: string;
  status: string;
  total: string;
}

export async function getRecentJournalEntries(): Promise<JournalEntryRow[]> {
  return query<JournalEntryRow>(
    `SELECT je.id, je.voucher_number, je.voucher_date::text, je.voucher_type,
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

// ===========================================================================
// Shared helpers for the full production lifecycle
// ===========================================================================

const round2 = (n: number) => Math.round(n * 100) / 100;

async function idByCode(
  client: PoolClient,
  table: string,
  codeCol: string,
  code: string,
  label: string,
): Promise<string> {
  const res = await client.query(
    `SELECT id FROM ${table} WHERE ${codeCol} = $1`,
    [code],
  );
  if (res.rows.length === 0) throw new Error(`${label} '${code}' not found.`);
  return res.rows[0].id as string;
}

const itemIdByCode = (c: PoolClient, code: string) =>
  idByCode(c, "master.items", "item_code", code, "Item");
const locationIdByCode = (c: PoolClient, code: string) =>
  idByCode(c, "inventory.locations", "location_code", code, "Location");
const partyIdByCode = (c: PoolClient, code: string) =>
  idByCode(c, "master.parties", "party_code", code, "Party");

interface JournalLineInput {
  accountCode: string;
  debit?: number;
  credit?: number;
  partyId?: string | null;
  saleOrderId?: string | null;
  productionOrderId?: string | null;
  description?: string;
}

/** Post a balanced N-line journal entry (validates Debits = Credits). */
async function postJournal(
  client: PoolClient,
  opts: {
    voucherType: string;
    referenceType: string;
    referenceId: string;
    voucherDate: string;
    description: string;
    lines: JournalLineInput[];
  },
): Promise<string> {
  const lines = opts.lines.filter(
    (l) => round2(l.debit ?? 0) > 0 || round2(l.credit ?? 0) > 0,
  );
  if (lines.length < 2) {
    throw new Error("A journal entry needs at least two non-zero lines.");
  }

  const entryRes = await client.query(
    `INSERT INTO accounting.journal_entries
       (voucher_number, voucher_date, voucher_type, reference_type, reference_id, description)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
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

  let lineNo = 0;
  for (const line of lines) {
    lineNo += 1;
    const accountId = await accountIdByCode(client, line.accountCode);
    await client.query(
      `INSERT INTO accounting.journal_lines
         (journal_entry_id, line_number, account_id, party_id, debit, credit,
          sale_order_id, production_order_id, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        entryId,
        lineNo,
        accountId,
        line.partyId ?? null,
        round2(line.debit ?? 0),
        round2(line.credit ?? 0),
        line.saleOrderId ?? null,
        line.productionOrderId ?? null,
        line.description ?? opts.description,
      ],
    );
  }

  const adminId = await getAdminUserId(client);
  await client.query("SELECT accounting.post_journal_entry($1, $2)", [
    entryId,
    adminId,
  ]);
  return entryId;
}

interface MovementInput {
  itemId: string;
  lotId?: string | null;
  fromLocationId?: string | null;
  toLocationId?: string | null;
  quantity: number;
  rate?: number | null;
  value?: number | null;
  saleOrderId?: string | null;
  productionOrderId?: string | null;
}

/** Record one posted inventory transaction with N movements (prevents negative stock). */
async function postInventory(
  client: PoolClient,
  opts: {
    transactionType: string;
    date: string;
    referenceType: string;
    referenceId: string;
    movements: MovementInput[];
  },
): Promise<string> {
  const adminId = await getAdminUserId(client);
  const txnRes = await client.query(
    `INSERT INTO inventory.inventory_transactions
       (transaction_number, transaction_type, transaction_date, reference_type, reference_id, status, posted_at, posted_by)
     VALUES ($1, $2, $3, $4, $5, 'POSTED', NOW(), $6) RETURNING id`,
    [
      docNumber("INV"),
      opts.transactionType,
      opts.date,
      opts.referenceType,
      opts.referenceId,
      adminId,
    ],
  );
  const txnId = txnRes.rows[0].id as string;

  for (const m of opts.movements) {
    await insertStockMovement(client, txnId, opts.date, m);
  }
  return txnId;
}

/** Issue or receive one movement, refusing a source location that cannot cover it. */
async function insertStockMovement(
  client: PoolClient,
  txnId: string,
  date: string,
  m: MovementInput,
) {
  if (m.fromLocationId) {
    const stockRes = await client.query(
      "SELECT inventory.get_location_stock($1, $2, $3) AS s",
      [m.itemId, m.lotId ?? null, m.fromLocationId],
    );
    const available = Number(stockRes.rows[0].s);
    if (available + 1e-9 < m.quantity) {
      throw new Error(
        `Insufficient stock to move ${m.quantity}; only ${available} available at source location.`,
      );
    }
  }
  await client.query(
    `INSERT INTO inventory.inventory_movements
       (inventory_transaction_id, movement_date, item_id, lot_id, from_location_id, to_location_id,
        quantity, rate, value, sale_order_id, production_order_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      txnId,
      date,
      m.itemId,
      m.lotId ?? null,
      m.fromLocationId ?? null,
      m.toLocationId ?? null,
      m.quantity,
      m.rate ?? null,
      m.value ?? null,
      m.saleOrderId ?? null,
      m.productionOrderId ?? null,
    ],
  );
}

async function addProductionCost(
  client: PoolClient,
  productionOrderId: string,
  costType: string,
  sourceType: string,
  sourceId: string,
  amount: number,
  date: string,
) {
  if (round2(amount) === 0) return;
  await client.query(
    `INSERT INTO production.production_costs
       (production_order_id, cost_type, source_type, source_id, amount, cost_date)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [productionOrderId, costType, sourceType, sourceId, round2(amount), date],
  );
}

// ===========================================================================
// Sales & production planning
// ===========================================================================

export async function createSaleOrder(input: {
  buyerCode: string;
  itemCode: string;
  designCode?: string | null;
  quantity: number;
  rate: number;
  date: string;
}) {
  if (!(input.quantity > 0)) throw new Error("Quantity must be greater than zero.");
  return withTransaction(async (client) => {
    const buyerId = await partyIdByCode(client, input.buyerCode);
    const itemId = await itemIdByCode(client, input.itemCode);
    const designId = input.designCode
      ? await idByCode(client, "master.designs", "design_code", input.designCode, "Design")
      : null;
    const soNumber = docNumber("SO");
    const amount = round2(input.quantity * input.rate);
    const soRes = await client.query(
      `INSERT INTO sales.sale_orders (so_number, order_date, buyer_id, status, remarks)
       VALUES ($1, $2, $3, 'APPROVED', $4) RETURNING id`,
      [soNumber, input.date, buyerId, "Created via app"],
    );
    const saleOrderId = soRes.rows[0].id as string;
    await client.query(
      `INSERT INTO sales.sale_order_items
         (sale_order_id, design_id, item_id, ordered_quantity, rate, amount)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [saleOrderId, designId, itemId, input.quantity, input.rate, amount],
    );
    return { saleOrderId, soNumber, amount };
  });
}

export async function createProductionOrder(input: {
  saleOrderId: string;
  designCode: string;
  plannedQuantity: number;
  greyItemCode: string;
  date: string;
}) {
  if (!(input.plannedQuantity > 0))
    throw new Error("Planned quantity must be greater than zero.");
  return withTransaction(async (client) => {
    const designRow = await client.query(
      "SELECT id, standard_consumption FROM master.designs WHERE design_code = $1",
      [input.designCode],
    );
    if (designRow.rows.length === 0)
      throw new Error(`Design '${input.designCode}' not found.`);
    const designId = designRow.rows[0].id as string;
    const consumption = Number(designRow.rows[0].standard_consumption ?? 0);
    const greyItemId = await itemIdByCode(client, input.greyItemCode);
    const totalRequired = round2(consumption * input.plannedQuantity);
    const poNumber = docNumber("PO");

    const poRes = await client.query(
      `INSERT INTO production.production_orders
         (po_number, sale_order_id, design_id, planned_quantity, start_date, status)
       VALUES ($1, $2, $3, $4, $5, 'APPROVED') RETURNING id`,
      [poNumber, input.saleOrderId, designId, input.plannedQuantity, input.date],
    );
    const productionOrderId = poRes.rows[0].id as string;
    await client.query(
      `INSERT INTO production.production_bom
         (production_order_id, item_id, quantity_per_unit, planned_quantity, total_required_quantity)
       VALUES ($1, $2, $3, $4, $5)`,
      [productionOrderId, greyItemId, consumption, input.plannedQuantity, totalRequired],
    );
    return { productionOrderId, poNumber, totalGreyRequired: totalRequired };
  });
}

export async function allocateGrey(input: {
  greyLotId: string;
  saleOrderId: string;
  productionOrderId: string;
  quantity: number;
  date: string;
}) {
  if (!(input.quantity > 0)) throw new Error("Quantity must be greater than zero.");
  return withTransaction(async (client) => {
    const lotRow = await client.query(
      "SELECT item_id FROM inventory.grey_lots WHERE id = $1",
      [input.greyLotId],
    );
    if (lotRow.rows.length === 0) throw new Error("Grey lot not found.");
    const ownerGrey = await locationIdByCode(client, "OWNER_GREY");
    const stockRes = await client.query(
      "SELECT inventory.get_location_stock($1, $2, $3) AS s",
      [lotRow.rows[0].item_id, input.greyLotId, ownerGrey],
    );
    if (Number(stockRes.rows[0].s) + 1e-9 < input.quantity) {
      throw new Error("Not enough grey stock in the owner store for this lot.");
    }
    const res = await client.query(
      `INSERT INTO inventory.grey_allocations
         (grey_lot_id, sale_order_id, production_order_id, allocated_quantity, allocation_date, status)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE') RETURNING id`,
      [input.greyLotId, input.saleOrderId, input.productionOrderId, input.quantity, input.date],
    );
    return { allocationId: res.rows[0].id as string };
  });
}

// ===========================================================================
// Processing (issue → receive + shortage → bill)
// ===========================================================================

export async function issueGreyToProcessor(input: {
  productionOrderId: string;
  saleOrderId?: string | null;
  processorCode: string;
  greyLotId: string;
  quantity: number;
  date: string;
}) {
  if (!(input.quantity > 0)) throw new Error("Quantity must be greater than zero.");
  return withTransaction(async (client) => {
    const processorId = await partyIdByCode(client, input.processorCode);
    const lotRow = await client.query(
      "SELECT item_id, purchase_rate FROM inventory.grey_lots WHERE id = $1",
      [input.greyLotId],
    );
    if (lotRow.rows.length === 0) throw new Error("Grey lot not found.");
    const itemId = lotRow.rows[0].item_id as string;
    const greyRate = Number(lotRow.rows[0].purchase_rate);
    const issuedValue = round2(input.quantity * greyRate);

    const poRes = await client.query(
      `INSERT INTO production.processing_orders
         (processing_order_number, processor_id, sale_order_id, production_order_id, issue_date, status)
       VALUES ($1, $2, $3, $4, $5, 'POSTED') RETURNING id`,
      [
        docNumber("PROC"),
        processorId,
        input.saleOrderId ?? null,
        input.productionOrderId,
        input.date,
      ],
    );
    const processingOrderId = poRes.rows[0].id as string;
    const lotIssueRes = await client.query(
      `INSERT INTO production.processing_order_lots
         (processing_order_id, grey_lot_id, issued_quantity, grey_rate, issued_value, status)
       VALUES ($1, $2, $3, $4, $5, 'OPEN') RETURNING id`,
      [processingOrderId, input.greyLotId, input.quantity, greyRate, issuedValue],
    );
    const processingOrderLotId = lotIssueRes.rows[0].id as string;

    const ownerGrey = await locationIdByCode(client, "OWNER_GREY");
    const processorLoc = await locationIdByCode(client, "BG_PROCESSOR");
    await postInventory(client, {
      transactionType: "ISSUE_TO_PROCESSOR",
      date: input.date,
      referenceType: "PROCESSING_ORDER",
      referenceId: processingOrderId,
      movements: [
        {
          itemId,
          lotId: input.greyLotId,
          fromLocationId: ownerGrey,
          toLocationId: processorLoc,
          quantity: input.quantity,
          rate: greyRate,
          value: issuedValue,
          productionOrderId: input.productionOrderId,
          saleOrderId: input.saleOrderId ?? null,
        },
      ],
    });
    // Custody/location move only — no P&L journal (per SDD §20).
    return { processingOrderId, processingOrderLotId, greyRate, issuedValue };
  });
}

export async function receiveProcessing(input: {
  processingOrderLotId: string;
  processedItemCode: string;
  processedQuantity: number;
  returnedQuantity: number;
  shortageQuantity: number;
  classification: "PROCESSOR_RECOVERABLE" | "NORMAL_PROCESS_LOSS" | "ABNORMAL_LOSS";
  date: string;
}) {
  return withTransaction(async (client) => {
    const lotRow = await client.query(
      `SELECT pol.id, pol.processing_order_id, pol.grey_lot_id, pol.issued_quantity, pol.grey_rate,
              po.processor_id, po.production_order_id, po.sale_order_id, gl.item_id AS grey_item_id
       FROM production.processing_order_lots pol
       JOIN production.processing_orders po ON po.id = pol.processing_order_id
       JOIN inventory.grey_lots gl ON gl.id = pol.grey_lot_id
       WHERE pol.id = $1`,
      [input.processingOrderLotId],
    );
    if (lotRow.rows.length === 0) throw new Error("Processing order lot not found.");
    const r = lotRow.rows[0];
    const issued = Number(r.issued_quantity);
    const greyRate = Number(r.grey_rate);
    const processed = input.processedQuantity;
    const returned = input.returnedQuantity;
    const shortage = input.shortageQuantity;

    if (Math.abs(issued - (processed + returned + shortage)) > 1e-6) {
      throw new Error(
        `Reconciliation failed: issued ${issued} must equal processed ${processed} + returned ${returned} + shortage ${shortage}.`,
      );
    }

    const processedItemId = await itemIdByCode(client, input.processedItemCode);
    const ownerGrey = await locationIdByCode(client, "OWNER_GREY");
    const processorLoc = await locationIdByCode(client, "BG_PROCESSOR");
    const processedStore = await locationIdByCode(client, "PROCESSED_STORE");

    await client.query(
      `UPDATE production.processing_order_lots
       SET processed_quantity = $2, returned_quantity = $3, shortage_quantity = $4,
           status = 'CLOSED'
       WHERE id = $1`,
      [input.processingOrderLotId, processed, returned, shortage],
    );

    const receiptRes = await client.query(
      `INSERT INTO production.processing_receipts
         (receipt_number, processing_order_id, receipt_date, status)
       VALUES ($1, $2, $3, 'POSTED') RETURNING id`,
      [docNumber("PRCPT"), r.processing_order_id, input.date],
    );
    await client.query(
      `INSERT INTO production.processing_receipt_lines
         (processing_receipt_id, processing_order_lot_id, processed_item_id, processed_quantity)
       VALUES ($1, $2, $3, $4)`,
      [receiptRes.rows[0].id, input.processingOrderLotId, processedItemId, processed],
    );

    // Physical movements: all issued grey leaves the processor floor.
    const movements: MovementInput[] = [];
    if (processed > 0) {
      movements.push({
        itemId: r.grey_item_id,
        lotId: r.grey_lot_id,
        fromLocationId: processorLoc,
        toLocationId: null,
        quantity: processed + shortage,
        rate: greyRate,
        value: round2((processed + shortage) * greyRate),
        productionOrderId: r.production_order_id,
      });
      movements.push({
        itemId: processedItemId,
        lotId: null,
        fromLocationId: null,
        toLocationId: processedStore,
        quantity: processed,
        rate: greyRate,
        value: round2(processed * greyRate),
        productionOrderId: r.production_order_id,
      });
    } else if (shortage > 0) {
      movements.push({
        itemId: r.grey_item_id,
        lotId: r.grey_lot_id,
        fromLocationId: processorLoc,
        toLocationId: null,
        quantity: shortage,
        rate: greyRate,
        value: round2(shortage * greyRate),
        productionOrderId: r.production_order_id,
      });
    }
    if (returned > 0) {
      movements.push({
        itemId: r.grey_item_id,
        lotId: r.grey_lot_id,
        fromLocationId: processorLoc,
        toLocationId: ownerGrey,
        quantity: returned,
        rate: greyRate,
        value: round2(returned * greyRate),
        productionOrderId: r.production_order_id,
      });
    }
    if (movements.length > 0) {
      await postInventory(client, {
        transactionType: "PROCESSING_RECEIPT",
        date: input.date,
        referenceType: "PROCESSING_RECEIPT",
        referenceId: receiptRes.rows[0].id as string,
        movements,
      });
    }

    // Accounting: relieve grey inventory for the consumed portion.
    const processedValue = round2(processed * greyRate);
    const shortageValue = round2(shortage * greyRate);
    const consumedValue = round2(processedValue + shortageValue);

    if (consumedValue > 0) {
      const lines: JournalLineInput[] = [
        {
          accountCode: "1200",
          credit: consumedValue,
          productionOrderId: r.production_order_id,
          description: "Grey relieved from inventory (processing)",
        },
      ];
      if (processedValue > 0) {
        lines.push({
          accountCode: "5000",
          debit: processedValue,
          productionOrderId: r.production_order_id,
          description: "Grey consumed into processed cloth",
        });
      }
      if (shortageValue > 0) {
        if (input.classification === "PROCESSOR_RECOVERABLE") {
          lines.push({
            accountCode: "2100",
            debit: shortageValue,
            partyId: r.processor_id,
            productionOrderId: r.production_order_id,
            description: "Processor-recoverable shortage",
          });
        } else if (input.classification === "NORMAL_PROCESS_LOSS") {
          lines.push({
            accountCode: "5200",
            debit: shortageValue,
            productionOrderId: r.production_order_id,
            description: "Normal process loss",
          });
        } else {
          lines.push({
            accountCode: "5300",
            debit: shortageValue,
            productionOrderId: r.production_order_id,
            description: "Abnormal loss",
          });
        }
      }
      await postJournal(client, {
        voucherType: "PROCESSING_RECEIPT",
        referenceType: "PROCESSING_RECEIPT",
        referenceId: receiptRes.rows[0].id as string,
        voucherDate: input.date,
        description: "Processing receipt — grey consumption & shortage",
        lines,
      });
    }

    // Shortage document (settlement tracked on the processing bill).
    if (shortage > 0) {
      await client.query(
        `INSERT INTO production.processor_shortages
           (processing_order_lot_id, shortage_quantity, grey_rate, shortage_value,
            classification, recoverable_from_processor, settlement_status)
         VALUES ($1, $2, $3, $4, $5, $6, 'OPEN')`,
        [
          input.processingOrderLotId,
          shortage,
          greyRate,
          shortageValue,
          input.classification,
          input.classification === "PROCESSOR_RECOVERABLE",
        ],
      );
    }

    // Management costing: grey material cost attributed to the production order.
    await addProductionCost(
      client,
      r.production_order_id,
      "GREY",
      "PROCESSING_RECEIPT",
      receiptRes.rows[0].id as string,
      processedValue,
      input.date,
    );
    if (input.classification === "NORMAL_PROCESS_LOSS" && shortageValue > 0) {
      await addProductionCost(
        client,
        r.production_order_id,
        "NORMAL_LOSS",
        "PROCESSING_RECEIPT",
        receiptRes.rows[0].id as string,
        shortageValue,
        input.date,
      );
    }

    return {
      receiptId: receiptRes.rows[0].id as string,
      processedValue,
      shortageValue,
    };
  });
}

export async function createProcessingBill(input: {
  processingOrderId: string;
  quantity: number;
  rate: number;
  otherDeductions?: number;
  date: string;
}) {
  if (!(input.quantity > 0)) throw new Error("Quantity must be greater than zero.");
  return withTransaction(async (client) => {
    const poRow = await client.query(
      "SELECT processor_id, production_order_id FROM production.processing_orders WHERE id = $1",
      [input.processingOrderId],
    );
    if (poRow.rows.length === 0) throw new Error("Processing order not found.");
    const processorId = poRow.rows[0].processor_id as string;
    const productionOrderId = poRow.rows[0].production_order_id as string;

    const gross = round2(input.quantity * input.rate);
    const otherDeductions = round2(input.otherDeductions ?? 0);
    const recovRes = await client.query(
      `SELECT COALESCE(SUM(ps.shortage_value), 0) AS rec
       FROM production.processor_shortages ps
       JOIN production.processing_order_lots pol ON pol.id = ps.processing_order_lot_id
       WHERE pol.processing_order_id = $1 AND ps.recoverable_from_processor = TRUE`,
      [input.processingOrderId],
    );
    const shortageRecovery = round2(Number(recovRes.rows[0].rec));
    const netPayable = round2(gross - shortageRecovery - otherDeductions);

    const billRes = await client.query(
      `INSERT INTO production.processing_bills
         (bill_number, processor_id, processing_order_id, bill_date, gross_amount,
          shortage_recovery, other_deductions, net_payable, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'POSTED') RETURNING id`,
      [
        docNumber("PBILL"),
        processorId,
        input.processingOrderId,
        input.date,
        gross,
        shortageRecovery,
        otherDeductions,
        netPayable,
      ],
    );
    const billId = billRes.rows[0].id as string;
    await client.query(
      `INSERT INTO production.processing_bill_lines
         (processing_bill_id, quantity, processing_rate, amount)
       VALUES ($1, $2, $3, $4)`,
      [billId, input.quantity, input.rate, gross],
    );

    // Dr Processing Cost / Cr Processor Payable (gross). Recovery was already
    // debited to the processor at receipt, so the net payable balance is correct.
    await postJournal(client, {
      voucherType: "PROCESSING_BILL",
      referenceType: "PROCESSING_BILL",
      referenceId: billId,
      voucherDate: input.date,
      description: "Processing bill",
      lines: [
        { accountCode: "5100", debit: gross, productionOrderId },
        { accountCode: "2100", credit: gross, partyId: processorId, productionOrderId },
      ],
    });

    await client.query(
      `UPDATE production.processor_shortages ps
       SET settlement_status = 'SETTLED', processing_bill_id = $2
       FROM production.processing_order_lots pol
       WHERE ps.processing_order_lot_id = pol.id
         AND pol.processing_order_id = $1
         AND ps.recoverable_from_processor = TRUE`,
      [input.processingOrderId, billId],
    );

    await addProductionCost(
      client,
      productionOrderId,
      "PROCESSING",
      "PROCESSING_BILL",
      billId,
      gross,
      input.date,
    );

    return { billId, gross, shortageRecovery, netPayable };
  });
}

// ===========================================================================
// Stitching (issue → receive → bill) and finished goods
// ===========================================================================

export async function issueToStitcher(input: {
  productionOrderId: string;
  stitcherCode: string;
  processedItemCode: string;
  quantity: number;
  date: string;
}) {
  if (!(input.quantity > 0)) throw new Error("Quantity must be greater than zero.");
  return withTransaction(async (client) => {
    const stitcherId = await partyIdByCode(client, input.stitcherCode);
    const processedItemId = await itemIdByCode(client, input.processedItemCode);
    const designRow = await client.query(
      "SELECT design_id FROM production.production_orders WHERE id = $1",
      [input.productionOrderId],
    );
    const designId = designRow.rows[0]?.design_id ?? null;

    const soRes = await client.query(
      `INSERT INTO production.stitching_orders
         (stitching_order_number, stitcher_id, production_order_id, design_id, issue_date, status)
       VALUES ($1, $2, $3, $4, $5, 'POSTED') RETURNING id`,
      [docNumber("STO"), stitcherId, input.productionOrderId, designId, input.date],
    );
    const stitchingOrderId = soRes.rows[0].id as string;

    const rateRow = await client.query(
      `SELECT AVG(rate) AS rate FROM inventory.inventory_movements
       WHERE item_id = $1 AND to_location_id = (SELECT id FROM inventory.locations WHERE location_code='PROCESSED_STORE')`,
      [processedItemId],
    );
    const rate = rateRow.rows[0].rate ? Number(rateRow.rows[0].rate) : null;

    const miRes = await client.query(
      `INSERT INTO production.stitching_material_issues
         (stitching_order_id, item_id, quantity, rate, issue_date)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [stitchingOrderId, processedItemId, input.quantity, rate, input.date],
    );

    const processedStore = await locationIdByCode(client, "PROCESSED_STORE");
    const stitcherLoc = await locationIdByCode(client, "STITCHER");
    await postInventory(client, {
      transactionType: "ISSUE_TO_STITCHER",
      date: input.date,
      referenceType: "STITCHING_ORDER",
      referenceId: stitchingOrderId,
      movements: [
        {
          itemId: processedItemId,
          fromLocationId: processedStore,
          toLocationId: stitcherLoc,
          quantity: input.quantity,
          rate,
          productionOrderId: input.productionOrderId,
        },
      ],
    });
    // Custody/location move only — no P&L journal.
    return { stitchingOrderId, materialIssueId: miRes.rows[0].id as string };
  });
}

export async function receiveStitching(input: {
  stitchingOrderId: string;
  finishedItemCode: string;
  processedItemCode: string;
  processedConsumed: number;
  finishedQuantity: number;
  acceptedQuantity: number;
  rejectedQuantity: number;
  date: string;
}) {
  return withTransaction(async (client) => {
    const soRow = await client.query(
      "SELECT production_order_id, design_id FROM production.stitching_orders WHERE id = $1",
      [input.stitchingOrderId],
    );
    if (soRow.rows.length === 0) throw new Error("Stitching order not found.");
    const productionOrderId = soRow.rows[0].production_order_id as string;
    const designId = soRow.rows[0].design_id as string | null;
    const finishedItemId = await itemIdByCode(client, input.finishedItemCode);
    const processedItemId = await itemIdByCode(client, input.processedItemCode);

    const receiptRes = await client.query(
      `INSERT INTO production.stitching_production_receipts
         (receipt_number, stitching_order_id, production_date, finished_quantity,
          accepted_quantity, rejected_quantity, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'POSTED') RETURNING id`,
      [
        docNumber("SRCPT"),
        input.stitchingOrderId,
        input.date,
        input.finishedQuantity,
        input.acceptedQuantity,
        input.rejectedQuantity,
      ],
    );

    await client.query(
      `INSERT INTO production.finished_goods_receipts
         (receipt_number, production_order_id, stitching_order_id, item_id, design_id, quantity, receipt_date, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'POSTED')`,
      [
        docNumber("FG"),
        productionOrderId,
        input.stitchingOrderId,
        finishedItemId,
        designId,
        input.acceptedQuantity,
        input.date,
      ],
    );

    const stitcherLoc = await locationIdByCode(client, "STITCHER");
    const finishedGoods = await locationIdByCode(client, "FINISHED_GOODS");
    const movements: MovementInput[] = [];
    if (input.processedConsumed > 0) {
      movements.push({
        itemId: processedItemId,
        fromLocationId: stitcherLoc,
        toLocationId: null,
        quantity: input.processedConsumed,
        productionOrderId,
      });
    }
    if (input.acceptedQuantity > 0) {
      movements.push({
        itemId: finishedItemId,
        fromLocationId: null,
        toLocationId: finishedGoods,
        quantity: input.acceptedQuantity,
        productionOrderId,
      });
    }
    if (movements.length > 0) {
      await postInventory(client, {
        transactionType: "STITCHING_RECEIPT",
        date: input.date,
        referenceType: "STITCHING_RECEIPT",
        referenceId: receiptRes.rows[0].id as string,
        movements,
      });
    }

    await client.query(
      "UPDATE production.production_orders SET actual_quantity = COALESCE(actual_quantity,0) + $2 WHERE id = $1",
      [productionOrderId, input.acceptedQuantity],
    );

    return { receiptId: receiptRes.rows[0].id as string };
  });
}

export async function createStitchingBill(input: {
  stitchingOrderId: string;
  quantity: number;
  rate: number;
  deductions?: number;
  date: string;
}) {
  if (!(input.quantity > 0)) throw new Error("Quantity must be greater than zero.");
  return withTransaction(async (client) => {
    const soRow = await client.query(
      "SELECT stitcher_id, production_order_id FROM production.stitching_orders WHERE id = $1",
      [input.stitchingOrderId],
    );
    if (soRow.rows.length === 0) throw new Error("Stitching order not found.");
    const stitcherId = soRow.rows[0].stitcher_id as string;
    const productionOrderId = soRow.rows[0].production_order_id as string;
    const gross = round2(input.quantity * input.rate);
    const deductions = round2(input.deductions ?? 0);
    const netPayable = round2(gross - deductions);

    const billRes = await client.query(
      `INSERT INTO production.stitching_bills
         (bill_number, stitcher_id, stitching_order_id, bill_date, gross_amount, deductions, net_payable, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'POSTED') RETURNING id`,
      [docNumber("SBILL"), stitcherId, input.stitchingOrderId, input.date, gross, deductions, netPayable],
    );
    const billId = billRes.rows[0].id as string;
    await client.query(
      `INSERT INTO production.stitching_bill_lines (stitching_bill_id, quantity, rate, amount)
       VALUES ($1, $2, $3, $4)`,
      [billId, input.quantity, input.rate, gross],
    );

    await postJournal(client, {
      voucherType: "STITCHING_BILL",
      referenceType: "STITCHING_BILL",
      referenceId: billId,
      voucherDate: input.date,
      description: "Stitching bill",
      lines: [
        { accountCode: "5400", debit: netPayable, productionOrderId },
        { accountCode: "2200", credit: netPayable, partyId: stitcherId, productionOrderId },
      ],
    });

    await addProductionCost(
      client,
      productionOrderId,
      "STITCHING",
      "STITCHING_BILL",
      billId,
      netPayable,
      input.date,
    );

    return { billId, gross, netPayable };
  });
}

export async function dispatchSale(input: {
  saleOrderId: string;
  finishedItemCode: string;
  customerCode: string;
  quantity: number;
  rate: number;
  paymentType: "CASH" | "CREDIT";
  date: string;
}) {
  if (!(input.quantity > 0)) throw new Error("Quantity must be greater than zero.");
  const amount = round2(input.quantity * input.rate);
  const plan = buildDispatchSalesJournal({ amount, paymentType: input.paymentType });
  return withTransaction(async (client) => {
    const customerId = await partyIdByCode(client, input.customerCode);
    const finishedItemId = await itemIdByCode(client, input.finishedItemCode);
    const finishedGoods = await locationIdByCode(client, "FINISHED_GOODS");

    const inventoryTransactionId = await postInventory(client, {
      transactionType: "SALE_DISPATCH",
      date: input.date,
      referenceType: "SALE_ORDER",
      referenceId: input.saleOrderId,
      movements: [
        {
          itemId: finishedItemId,
          fromLocationId: finishedGoods,
          toLocationId: null,
          quantity: input.quantity,
          rate: input.rate,
          value: amount,
          saleOrderId: input.saleOrderId,
        },
      ],
    });

    const doNumber = await nextSeriesNumber(client, "DO");
    const invoiceNumber = await nextSeriesNumber(client, "SI");
    const itemName = (
      await client.query("SELECT item_name FROM master.items WHERE id = $1", [finishedItemId])
    ).rows[0].item_name as string;

    const dispatchRes = await client.query(
      `INSERT INTO sales.dispatches
         (do_number, invoice_number, sale_order_id, customer_id, item_id,
          dispatch_date, quantity, rate, amount, payment_type, status,
          inventory_transaction_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'POSTED',$11)
       RETURNING id`,
      [
        doNumber,
        invoiceNumber,
        input.saleOrderId,
        customerId,
        finishedItemId,
        input.date,
        input.quantity,
        input.rate,
        plan.amount,
        input.paymentType.trim().toUpperCase(),
        inventoryTransactionId,
      ],
    );
    const dispatchId = dispatchRes.rows[0].id as string;

    const journalEntryId = await postJournal(client, {
      voucherType: "SALE",
      referenceType: "SALE_ORDER",
      referenceId: input.saleOrderId,
      voucherDate: input.date,
      description: `Sales invoice ${invoiceNumber} / ${doNumber} — ${itemName}`,
      lines: plan.lines.map((l) => ({
        accountCode: l.accountCode,
        debit: l.debit,
        credit: l.credit,
        partyId: l.withCustomer ? customerId : null,
        saleOrderId: input.saleOrderId,
        description: invoiceNumber,
      })),
    });

    await client.query(
      "UPDATE sales.dispatches SET journal_entry_id = $2 WHERE id = $1",
      [dispatchId, journalEntryId],
    );
    await client.query(
      "UPDATE sales.sale_orders SET status = 'CLOSED' WHERE id = $1",
      [input.saleOrderId],
    );

    return {
      amount: plan.amount,
      saleOrderId: input.saleOrderId,
      dispatchId,
      doNumber,
      invoiceNumber,
      journalEntryId,
    };
  });
}

export interface DispatchDocument {
  id: string;
  do_number: string;
  invoice_number: string;
  dispatch_date: string;
  quantity: string;
  rate: string;
  amount: string;
  payment_type: string;
  status: string;
  journal_entry_id: string | null;
  voucher_number: string | null;
  sale_order_id: string;
  so_number: string;
  customer_id: string;
  customer_code: string;
  customer_name: string;
  customer_address: string | null;
  customer_phone: string | null;
  item_code: string;
  item_name: string;
  unit_name: string | null;
}

const DISPATCH_SELECT = `
  SELECT d.id, d.do_number, d.invoice_number, d.dispatch_date::text,
         d.quantity::text, d.rate::text, d.amount::text, d.payment_type, d.status,
         d.journal_entry_id, je.voucher_number,
         d.sale_order_id, so.so_number,
         p.id AS customer_id, p.party_code AS customer_code, p.party_name AS customer_name,
         p.address AS customer_address, p.phone AS customer_phone,
         i.item_code, i.item_name, u.unit_name
  FROM sales.dispatches d
  JOIN sales.sale_orders so ON so.id = d.sale_order_id
  JOIN master.parties p ON p.id = d.customer_id
  JOIN master.items i ON i.id = d.item_id
  LEFT JOIN master.units u ON u.id = i.unit_id
  LEFT JOIN accounting.journal_entries je ON je.id = d.journal_entry_id
`;

export interface CustomerBalance {
  previous_balance: string;
  invoice_balance: string;
  closing_balance: string;
}

/** Posted receivable before this bill, plus the bill itself when it is on credit. */
async function customerAccountPosition(input: {
  customerId: string;
  invoiceDate: string;
  journalEntryId: string | null;
  paymentType: string;
  net: number;
}): Promise<CustomerBalance> {
  const rows = await query<{ balance: string }>(
    `SELECT COALESCE(SUM(jl.debit - jl.credit), 0)::text AS balance
     FROM accounting.journal_lines jl
     JOIN accounting.journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'POSTED'
     JOIN accounting.accounts a ON a.id = jl.account_id AND a.account_code = $4
     WHERE jl.party_id = $1
       AND ($2::uuid IS NULL OR je.id <> $2::uuid)
       AND je.voucher_date <= $3::date
       AND (
         $2::uuid IS NULL
         OR je.voucher_date < $3::date
         OR (
           je.voucher_date = $3::date
           AND je.created_at <= (SELECT created_at FROM accounting.journal_entries WHERE id = $2::uuid)
         )
       )`,
    [input.customerId, input.journalEntryId, input.invoiceDate, SALES_ACCOUNTS.receivable],
  );
  const position = customerClosingBalance(
    Number(rows[0]?.balance ?? 0),
    receivableOnInvoice(input.paymentType, input.net),
  );
  return {
    previous_balance: position.previous.toFixed(2),
    invoice_balance: position.invoice.toFixed(2),
    closing_balance: position.closing.toFixed(2),
  };
}

export async function getDispatch(id: string): Promise<(DispatchDocument & CustomerBalance) | null> {
  const rows = await query<DispatchDocument>(`${DISPATCH_SELECT} WHERE d.id = $1`, [id]);
  const row = rows[0];
  if (!row) return null;
  const balance = await customerAccountPosition({
    customerId: row.customer_id,
    invoiceDate: row.dispatch_date,
    journalEntryId: row.journal_entry_id,
    paymentType: row.payment_type,
    net: Number(row.amount),
  });
  return { ...row, ...balance };
}

export async function listDispatches(): Promise<DispatchDocument[]> {
  return query<DispatchDocument>(
    `${DISPATCH_SELECT} ORDER BY d.created_at DESC LIMIT 100`,
  );
}

export interface ManualInvoiceLine {
  line_number: number;
  description: string;
  quantity: string;
  rate: string;
  amount: string;
}

export interface ManualInvoiceDocument {
  id: string;
  invoice_number: string;
  invoice_date: string;
  payment_type: string;
  gross_amount: string;
  discount_amount: string;
  tax_amount: string;
  net_amount: string;
  narration: string | null;
  status: string;
  journal_entry_id: string | null;
  voucher_number: string | null;
  customer_id: string;
  customer_code: string;
  customer_name: string;
  customer_address: string | null;
  customer_phone: string | null;
  lines: ManualInvoiceLine[];
}

export interface ManualInvoiceSummary {
  id: string;
  invoice_number: string;
  invoice_date: string;
  payment_type: string;
  net_amount: string;
  customer_name: string;
  journal_entry_id: string | null;
  voucher_number: string | null;
}

function requireIsoDate(date: string): string {
  const value = (date ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Enter a valid date.");
  return value;
}

function requireDocumentId(id: string): string {
  const value = (id ?? "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error("Sales invoice not found.");
  }
  return value;
}

interface PreparedManualLine {
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

function prepareManualInvoiceLines(
  lines: { description?: string; quantity?: number; rate?: number }[] | undefined,
): { prepared: PreparedManualLine[]; gross: number } {
  const prepared = (lines ?? [])
    .map((l) => ({
      description: String(l.description ?? "").trim(),
      quantity: Number(l.quantity),
      rate: Number(l.rate),
    }))
    .filter((l) => l.description || l.quantity || l.rate)
    .map((l) => ({
      ...l,
      amount: round2(l.quantity * l.rate),
    }));
  if (prepared.length === 0) throw new Error("Enter at least one invoice line.");
  for (const line of prepared) {
    if (!line.description) throw new Error("Each invoice line needs a description.");
    if (!(line.quantity > 0)) throw new Error("Each invoice line needs a quantity greater than zero.");
    if (!(line.rate >= 0)) throw new Error("Rate cannot be negative.");
    if (!(line.amount > 0)) throw new Error("Each invoice line needs an amount greater than zero.");
  }
  return { prepared, gross: round2(prepared.reduce((s, l) => s + l.amount, 0)) };
}

function manualSalesDescription(
  invoiceNumber: string,
  customerName: string,
  narration: string | null,
): string {
  return narration
    ? `Manual sales invoice ${invoiceNumber} — ${customerName}. ${narration}`
    : `Manual sales invoice ${invoiceNumber} — ${customerName}`;
}

function manualLineMemo(role: string, invoiceNumber: string): string {
  if (role === "discount") return `Discount on ${invoiceNumber}`;
  if (role === "tax") return `Sales tax on ${invoiceNumber}`;
  return invoiceNumber;
}

/**
 * Manual sales invoice. Does not move stock and does not require a sale order.
 * The journal follows buildManualSalesJournal: settlement account, discount,
 * sales income, and sales tax payable.
 */
export async function createManualSalesInvoice(input: {
  customerCode: string;
  paymentType: SalesPaymentType;
  discount?: number;
  salesTax?: number;
  date: string;
  narration?: string;
  lines: { description?: string; quantity?: number; rate?: number }[];
}) {
  const date = requireIsoDate(input.date);
  const { prepared, gross } = prepareManualInvoiceLines(input.lines);
  const discount = round2(Number(input.discount ?? 0));
  const tax = round2(Number(input.salesTax ?? 0));
  const plan = buildManualSalesJournal({
    gross,
    discount,
    tax,
    paymentType: input.paymentType,
  });
  const paymentType = input.paymentType.trim().toUpperCase();

  return withTransaction(async (client) => {
    const customerId = await partyIdByCode(client, input.customerCode);
    const customerName = (
      await client.query("SELECT party_name FROM master.parties WHERE id = $1", [customerId])
    ).rows[0].party_name as string;
    const invoiceNumber = await nextSeriesNumber(client, "MS");
    const narration = (input.narration ?? "").trim() || null;

    const invoiceRes = await client.query(
      `INSERT INTO sales.manual_invoices
         (invoice_number, customer_id, invoice_date, payment_type,
          gross_amount, discount_amount, tax_amount, net_amount, narration, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'POSTED')
       RETURNING id`,
      [
        invoiceNumber,
        customerId,
        date,
        paymentType,
        gross,
        discount,
        tax,
        plan.net,
        narration,
      ],
    );
    const invoiceId = invoiceRes.rows[0].id as string;

    let lineNo = 0;
    for (const line of prepared) {
      lineNo += 1;
      await client.query(
        `INSERT INTO sales.manual_invoice_lines
           (invoice_id, line_number, description, quantity, rate, amount)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [invoiceId, lineNo, line.description, line.quantity, line.rate, line.amount],
      );
    }

    const journalEntryId = await postJournal(client, {
      voucherType: "MANUAL_SALE",
      referenceType: "MANUAL_SALE",
      referenceId: invoiceId,
      voucherDate: date,
      description: manualSalesDescription(invoiceNumber, customerName, narration),
      lines: plan.lines.map((l) => ({
        accountCode: l.accountCode,
        debit: l.debit,
        credit: l.credit,
        partyId: l.withCustomer ? customerId : null,
        description: manualLineMemo(l.role, invoiceNumber),
      })),
    });

    await client.query(
      "UPDATE sales.manual_invoices SET journal_entry_id = $2 WHERE id = $1",
      [invoiceId, journalEntryId],
    );

    return {
      invoiceId,
      invoiceNumber,
      grossAmount: gross,
      discountAmount: discount,
      taxAmount: tax,
      netAmount: plan.net,
      journalEntryId,
    };
  });
}

const MANUAL_INVOICE_SELECT = `
  SELECT m.id, m.invoice_number, m.invoice_date::text, m.payment_type,
         m.gross_amount::text, m.discount_amount::text, m.tax_amount::text, m.net_amount::text,
         m.narration, m.status, m.journal_entry_id, je.voucher_number,
         p.id AS customer_id, p.party_code AS customer_code, p.party_name AS customer_name,
         p.address AS customer_address, p.phone AS customer_phone
  FROM sales.manual_invoices m
  JOIN master.parties p ON p.id = m.customer_id
  LEFT JOIN accounting.journal_entries je ON je.id = m.journal_entry_id
`;

export async function getManualInvoice(
  id: string,
): Promise<(ManualInvoiceDocument & CustomerBalance) | null> {
  const headers = await query<Omit<ManualInvoiceDocument, "lines">>(
    `${MANUAL_INVOICE_SELECT} WHERE m.id = $1`,
    [id],
  );
  const header = headers[0];
  if (!header) return null;
  const [lines, balance] = await Promise.all([
    query<ManualInvoiceLine>(
      `SELECT line_number, description, quantity::text, rate::text, amount::text
       FROM sales.manual_invoice_lines
       WHERE invoice_id = $1
       ORDER BY line_number`,
      [id],
    ),
    customerAccountPosition({
      customerId: header.customer_id,
      invoiceDate: header.invoice_date,
      journalEntryId: header.journal_entry_id,
      paymentType: header.payment_type,
      net: Number(header.net_amount),
    }),
  ]);
  return { ...header, lines, ...balance };
}

export async function listManualInvoices(): Promise<ManualInvoiceSummary[]> {
  return query<ManualInvoiceSummary>(
    `SELECT m.id, m.invoice_number, m.invoice_date::text, m.payment_type, m.net_amount::text,
            p.party_name AS customer_name, m.journal_entry_id, je.voucher_number
     FROM sales.manual_invoices m
     JOIN master.parties p ON p.id = m.customer_id
     LEFT JOIN accounting.journal_entries je ON je.id = m.journal_entry_id
     ORDER BY m.created_at DESC
     LIMIT 100`,
  );
}

interface DispatchEditRow {
  id: string;
  sale_order_id: string;
  item_id: string;
  quantity: string;
  dispatch_date: string;
  inventory_transaction_id: string | null;
  journal_entry_id: string | null;
  invoice_number: string;
  do_number: string;
}

const DISPATCH_EDIT_SQL = `
  SELECT id, sale_order_id, item_id, quantity::text, dispatch_date::text,
         inventory_transaction_id, journal_entry_id, invoice_number, do_number
  FROM sales.dispatches
`;

/** The finished-goods issue that belongs to this dispatch, and to no other bill. */
async function resolveDispatchInventoryTxn(
  client: PoolClient,
  row: DispatchEditRow,
): Promise<string> {
  if (row.inventory_transaction_id) {
    const shared = await client.query(
      `SELECT 1 FROM sales.dispatches
       WHERE inventory_transaction_id = $1 AND id <> $2`,
      [row.inventory_transaction_id, row.id],
    );
    if (shared.rows.length > 0) {
      throw new Error(
        "This dispatch shares a stock movement with another bill, so it cannot be changed.",
      );
    }
    const exists = await client.query(
      `SELECT id FROM inventory.inventory_transactions WHERE id = $1`,
      [row.inventory_transaction_id],
    );
    if (exists.rows.length === 1) return row.inventory_transaction_id;
  }

  const found = await client.query<{ id: string }>(
    `SELECT it.id
     FROM inventory.inventory_transactions it
     JOIN inventory.inventory_movements im ON im.inventory_transaction_id = it.id
     WHERE it.transaction_type = 'SALE_DISPATCH'
       AND it.reference_type = 'SALE_ORDER'
       AND it.reference_id = $1
       AND it.transaction_date = $2::date
       AND im.item_id = $3
       AND im.quantity = $4::numeric
       AND im.sale_order_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM sales.dispatches d
         WHERE d.inventory_transaction_id = it.id AND d.id <> $5
       )`,
    [row.sale_order_id, row.dispatch_date, row.item_id, row.quantity, row.id],
  );
  if (found.rows.length !== 1) {
    throw new Error(
      "Could not match the finished-goods movement for this dispatch, so the bill cannot be changed.",
    );
  }
  return found.rows[0].id;
}

/** Put the previous issue back, then post the replacement movement on the same transaction. */
async function rewriteDispatchMovement(
  client: PoolClient,
  txnId: string,
  date: string,
  movement: MovementInput,
) {
  await client.query(
    `DELETE FROM inventory.inventory_movements WHERE inventory_transaction_id = $1`,
    [txnId],
  );
  await client.query(
    `UPDATE inventory.inventory_transactions SET transaction_date = $2 WHERE id = $1`,
    [txnId, date],
  );
  await insertStockMovement(client, txnId, date, movement);
}

/**
 * Rewrite the lines of an existing voucher and keep its number.
 * A posted voucher stays posted. A draft is posted again so the books match the bill.
 */
async function replaceJournalLines(
  client: PoolClient,
  journalEntryId: string,
  opts: {
    voucherDate: string;
    description: string;
    lines: JournalLineInput[];
  },
) {
  const lines = opts.lines.filter(
    (l) => round2(l.debit ?? 0) > 0 || round2(l.credit ?? 0) > 0,
  );
  if (lines.length < 2) {
    throw new Error("A journal entry needs at least two non-zero lines.");
  }
  const existing = await client.query<{ status: string }>(
    `SELECT status FROM accounting.journal_entries WHERE id = $1 FOR UPDATE`,
    [journalEntryId],
  );
  if (existing.rows.length === 0) throw new Error("Linked voucher was not found.");
  const status = existing.rows[0].status;
  if (status !== "POSTED" && status !== "DRAFT") {
    throw new Error(`Voucher status ${status} cannot be adjusted.`);
  }
  await client.query(
    `UPDATE accounting.journal_entries
     SET voucher_date = $2, description = $3
     WHERE id = $1`,
    [journalEntryId, opts.voucherDate, opts.description],
  );
  await client.query(
    `DELETE FROM accounting.journal_lines WHERE journal_entry_id = $1`,
    [journalEntryId],
  );
  let lineNo = 0;
  for (const line of lines) {
    lineNo += 1;
    const accountId = await accountIdByCode(client, line.accountCode);
    await client.query(
      `INSERT INTO accounting.journal_lines
         (journal_entry_id, line_number, account_id, party_id, debit, credit,
          sale_order_id, production_order_id, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        journalEntryId,
        lineNo,
        accountId,
        line.partyId ?? null,
        round2(line.debit ?? 0),
        round2(line.credit ?? 0),
        line.saleOrderId ?? null,
        line.productionOrderId ?? null,
        line.description ?? opts.description,
      ],
    );
  }
  if (status === "DRAFT") {
    const adminId = await getAdminUserId(client);
    await client.query("SELECT accounting.post_journal_entry($1, $2)", [
      journalEntryId,
      adminId,
    ]);
  } else {
    await client.query("SELECT accounting.validate_journal_entry($1)", [journalEntryId]);
  }
}

/**
 * Admin edit of a process-locked sale. Keeps the delivery order and invoice
 * numbers, rewrites finished-goods stock, and adjusts the linked sales voucher.
 */
export async function updateDispatchSale(input: {
  id: string;
  finishedItemCode: string;
  customerCode: string;
  quantity: number;
  rate: number;
  paymentType: string;
  date: string;
}) {
  const id = requireDocumentId(input.id);
  if (!(Number(input.quantity) > 0)) throw new Error("Quantity must be greater than zero.");
  const date = requireIsoDate(input.date);
  const quantity = Number(input.quantity);
  const rate = Number(input.rate);
  const plan = buildDispatchSalesJournal({
    amount: round2(quantity * rate),
    paymentType: input.paymentType,
  });
  const paymentType = input.paymentType.trim().toUpperCase();

  return withTransaction(async (client) => {
    const res = await client.query<DispatchEditRow>(
      `${DISPATCH_EDIT_SQL} WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const row = res.rows[0];
    if (!row) throw new Error("Sales invoice not found.");

    const customerId = await partyIdByCode(client, input.customerCode);
    const finishedItemId = await itemIdByCode(client, input.finishedItemCode);
    const itemRes = await client.query<{ item_name: string; item_type: string }>(
      `SELECT item_name, item_type FROM master.items WHERE id = $1`,
      [finishedItemId],
    );
    const item = itemRes.rows[0];
    if (!item || item.item_type !== "FINISHED_GOOD") {
      throw new Error("Dispatch sales use a finished good.");
    }
    const finishedGoods = await locationIdByCode(client, "FINISHED_GOODS");
    const txnId = await resolveDispatchInventoryTxn(client, row);
    await rewriteDispatchMovement(client, txnId, date, {
      itemId: finishedItemId,
      fromLocationId: finishedGoods,
      quantity,
      rate,
      value: plan.amount,
      saleOrderId: row.sale_order_id,
    });

    await client.query(
      `UPDATE sales.dispatches
       SET customer_id = $2, item_id = $3, dispatch_date = $4,
           quantity = $5, rate = $6, amount = $7, payment_type = $8,
           inventory_transaction_id = $9
       WHERE id = $1`,
      [id, customerId, finishedItemId, date, quantity, rate, plan.amount, paymentType, txnId],
    );

    const description = `Sales invoice ${row.invoice_number} / ${row.do_number} — ${item.item_name}`;
    const lines: JournalLineInput[] = plan.lines.map((l) => ({
      accountCode: l.accountCode,
      debit: l.debit,
      credit: l.credit,
      partyId: l.withCustomer ? customerId : null,
      saleOrderId: row.sale_order_id,
      description: row.invoice_number,
    }));
    let journalEntryId = row.journal_entry_id;
    if (journalEntryId) {
      await replaceJournalLines(client, journalEntryId, {
        voucherDate: date,
        description,
        lines,
      });
    } else {
      journalEntryId = await postJournal(client, {
        voucherType: "SALE",
        referenceType: "SALE_ORDER",
        referenceId: row.sale_order_id,
        voucherDate: date,
        description,
        lines,
      });
      await client.query(
        `UPDATE sales.dispatches SET journal_entry_id = $2 WHERE id = $1`,
        [id, journalEntryId],
      );
    }

    return {
      dispatchId: id,
      invoiceNumber: row.invoice_number,
      doNumber: row.do_number,
      amount: plan.amount,
      journalEntryId,
    };
  });
}

/** Admin delete of a process-locked sale, its voucher, and its stock issue. */
export async function deleteDispatchSale(input: { id: string }) {
  const id = requireDocumentId(input.id);
  return withTransaction(async (client) => {
    const res = await client.query<DispatchEditRow>(
      `${DISPATCH_EDIT_SQL} WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const row = res.rows[0];
    if (!row) throw new Error("Sales invoice not found.");
    const txnId = await resolveDispatchInventoryTxn(client, row);

    await client.query(`DELETE FROM sales.dispatches WHERE id = $1`, [id]);
    await client.query(
      `DELETE FROM inventory.inventory_movements WHERE inventory_transaction_id = $1`,
      [txnId],
    );
    await client.query(`DELETE FROM inventory.inventory_transactions WHERE id = $1`, [txnId]);

    if (row.journal_entry_id) {
      await client.query(
        `DELETE FROM master.document_files WHERE entity_type = 'JOURNAL' AND entity_id = $1`,
        [row.journal_entry_id],
      );
      await client.query(
        `DELETE FROM accounting.journal_lines WHERE journal_entry_id = $1`,
        [row.journal_entry_id],
      );
      await client.query(`DELETE FROM accounting.journal_entries WHERE id = $1`, [
        row.journal_entry_id,
      ]);
    }

    await client.query(
      `UPDATE sales.sale_orders SET status = 'OPEN', updated_at = NOW()
       WHERE id = $1 AND status = 'CLOSED'
         AND NOT EXISTS (SELECT 1 FROM sales.dispatches WHERE sale_order_id = $1)`,
      [row.sale_order_id],
    );
    return { ok: true, invoiceNumber: row.invoice_number };
  });
}

/**
 * Admin edit of a manual sales invoice. Keeps the invoice number and rewrites
 * the linked voucher so the accounts follow the new bill.
 */
export async function updateManualSalesInvoice(input: {
  id: string;
  customerCode: string;
  paymentType: string;
  discount?: number;
  salesTax?: number;
  date: string;
  narration?: string;
  lines: { description?: string; quantity?: number; rate?: number }[];
}) {
  const id = requireDocumentId(input.id);
  const date = requireIsoDate(input.date);
  const { prepared, gross } = prepareManualInvoiceLines(input.lines);
  const discount = round2(Number(input.discount ?? 0));
  const tax = round2(Number(input.salesTax ?? 0));
  const plan = buildManualSalesJournal({
    gross,
    discount,
    tax,
    paymentType: input.paymentType,
  });
  const paymentType = input.paymentType.trim().toUpperCase();
  const narration = (input.narration ?? "").trim() || null;

  return withTransaction(async (client) => {
    const existing = await client.query<{
      invoice_number: string;
      journal_entry_id: string | null;
    }>(
      `SELECT invoice_number, journal_entry_id
       FROM sales.manual_invoices WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const row = existing.rows[0];
    if (!row) throw new Error("Sales invoice not found.");

    const customerId = await partyIdByCode(client, input.customerCode);
    const customerName = (
      await client.query(`SELECT party_name FROM master.parties WHERE id = $1`, [customerId])
    ).rows[0].party_name as string;

    await client.query(
      `UPDATE sales.manual_invoices
       SET customer_id = $2, invoice_date = $3, payment_type = $4,
           gross_amount = $5, discount_amount = $6, tax_amount = $7,
           net_amount = $8, narration = $9, status = 'POSTED'
       WHERE id = $1`,
      [id, customerId, date, paymentType, gross, discount, tax, plan.net, narration],
    );
    await client.query(`DELETE FROM sales.manual_invoice_lines WHERE invoice_id = $1`, [id]);
    let lineNo = 0;
    for (const line of prepared) {
      lineNo += 1;
      await client.query(
        `INSERT INTO sales.manual_invoice_lines
           (invoice_id, line_number, description, quantity, rate, amount)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, lineNo, line.description, line.quantity, line.rate, line.amount],
      );
    }

    const description = manualSalesDescription(row.invoice_number, customerName, narration);
    const lines: JournalLineInput[] = plan.lines.map((l) => ({
      accountCode: l.accountCode,
      debit: l.debit,
      credit: l.credit,
      partyId: l.withCustomer ? customerId : null,
      description: manualLineMemo(l.role, row.invoice_number),
    }));
    let journalEntryId = row.journal_entry_id;
    if (journalEntryId) {
      await replaceJournalLines(client, journalEntryId, {
        voucherDate: date,
        description,
        lines,
      });
    } else {
      journalEntryId = await postJournal(client, {
        voucherType: "MANUAL_SALE",
        referenceType: "MANUAL_SALE",
        referenceId: id,
        voucherDate: date,
        description,
        lines,
      });
      await client.query(
        `UPDATE sales.manual_invoices SET journal_entry_id = $2 WHERE id = $1`,
        [id, journalEntryId],
      );
    }

    return {
      invoiceId: id,
      invoiceNumber: row.invoice_number,
      grossAmount: gross,
      discountAmount: discount,
      taxAmount: tax,
      netAmount: plan.net,
      journalEntryId,
    };
  });
}

// ===========================================================================
// Reports
// ===========================================================================

export async function getInventoryByStage() {
  return query<{
    location_code: string;
    location_name: string;
    location_type: string;
    item_code: string;
    item_name: string;
    item_type: string;
    stock: string;
  }>(
    `WITH moves AS (
       SELECT to_location_id AS loc, item_id, quantity AS qin, 0::numeric AS qout
       FROM inventory.inventory_movements WHERE to_location_id IS NOT NULL
       UNION ALL
       SELECT from_location_id, item_id, 0::numeric, quantity
       FROM inventory.inventory_movements WHERE from_location_id IS NOT NULL
     )
     SELECT l.location_code, l.location_name, l.location_type,
            it.item_code, it.item_name, it.item_type,
            SUM(mv.qin - mv.qout)::text AS stock
     FROM moves mv
     JOIN inventory.locations l ON l.id = mv.loc
     JOIN master.items it ON it.id = mv.item_id
     GROUP BY l.location_code, l.location_name, l.location_type, it.item_code, it.item_name, it.item_type
     HAVING SUM(mv.qin - mv.qout) > 0
     ORDER BY it.item_type, l.location_code`,
  );
}

export async function getPartyLedgers(range?: DateRange) {
  const dc = dateClause(range, 1);
  return query<{
    party_code: string;
    party_name: string;
    roles: string;
    debit: string;
    credit: string;
    balance: string;
  }>(
    `SELECT p.party_code, p.party_name,
            COALESCE(string_agg(DISTINCT r.role, ', '), '') AS roles,
            SUM(jl.debit)::text AS debit,
            SUM(jl.credit)::text AS credit,
            (SUM(jl.credit) - SUM(jl.debit))::text AS balance
     FROM accounting.journal_lines jl
     JOIN accounting.journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'POSTED'
     JOIN master.parties p ON p.id = jl.party_id
     LEFT JOIN master.party_roles r ON r.party_id = p.id
     WHERE TRUE${dc.sql}
     GROUP BY p.id, p.party_code, p.party_name
     HAVING SUM(jl.debit) <> 0 OR SUM(jl.credit) <> 0
     ORDER BY p.party_name`,
    dc.params,
  );
}

export interface ControlSubRow {
  party_code: string;
  party_name: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface ControlLedgerGroup {
  account_code: string;
  account_name: string;
  account_type: string;
  caption: string;
  party_role: string;
  normal_side: "DEBIT" | "CREDIT";
  debit: number;
  credit: number;
  control_balance: number;
  unallocated: number;
  unallocated_debit: number;
  unallocated_credit: number;
  sub_total: number;
  composed: boolean;
  subs: ControlSubRow[];
}

function naturalBalance(side: "DEBIT" | "CREDIT", debit: number, credit: number): number {
  return side === "DEBIT" ? debit - credit : credit - debit;
}

/** Control GL accounts composed of customer / vendor / processor / stitcher sub-ledgers. */
export async function getControlLedgers(
  range?: DateRange,
  opts?: { includeZeroParties?: boolean },
): Promise<ControlLedgerGroup[]> {
  const controls = await query<{
    account_id: string;
    account_code: string;
    account_name: string;
    account_type: string;
    caption: string;
    party_role: string;
    normal_side: "DEBIT" | "CREDIT";
  }>(
    `SELECT a.id AS account_id, a.account_code, a.account_name, a.account_type,
            cl.caption, cl.party_role, cl.normal_side
     FROM accounting.control_ledgers cl
     JOIN accounting.accounts a ON a.id = cl.account_id
     ORDER BY a.account_code`,
  );

  const dc = dateClause(range, 1);
  const totals = await query<{
    account_id: string;
    party_id: string | null;
    debit: string;
    credit: string;
  }>(
    `SELECT a.id AS account_id, jl.party_id,
            COALESCE(SUM(jl.debit), 0)::text AS debit,
            COALESCE(SUM(jl.credit), 0)::text AS credit
     FROM accounting.journal_lines jl
     JOIN accounting.journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'POSTED'
     JOIN accounting.accounts a ON a.id = jl.account_id
     JOIN accounting.control_ledgers cl ON cl.account_id = a.id
     WHERE TRUE${dc.sql}
     GROUP BY a.id, jl.party_id`,
    dc.params,
  );

  const parties = await query<{
    id: string;
    party_code: string;
    party_name: string;
    role: string;
  }>(
    `SELECT p.id, p.party_code, p.party_name, r.role
     FROM master.parties p
     JOIN master.party_roles r ON r.party_id = p.id
     WHERE p.status = 'ACTIVE'
     ORDER BY p.party_name`,
  );

  const partyById = new Map(parties.map((p) => [p.id, p]));

  return controls.map((c) => {
    const rows = totals.filter((t) => t.account_id === c.account_id);
    const debit = rows.reduce((s, r) => s + Number(r.debit), 0);
    const credit = rows.reduce((s, r) => s + Number(r.credit), 0);
    const control_balance = naturalBalance(c.normal_side, debit, credit);

    const unallocRow = rows.find((r) => r.party_id == null);
    const unallocated_debit = unallocRow ? Number(unallocRow.debit) : 0;
    const unallocated_credit = unallocRow ? Number(unallocRow.credit) : 0;
    const unallocated = unallocRow
      ? naturalBalance(c.normal_side, unallocated_debit, unallocated_credit)
      : 0;

    const byParty = new Map<string, { debit: number; credit: number }>();
    for (const r of rows) {
      if (!r.party_id) continue;
      const cur = byParty.get(r.party_id) ?? { debit: 0, credit: 0 };
      cur.debit += Number(r.debit);
      cur.credit += Number(r.credit);
      byParty.set(r.party_id, cur);
    }

    const seen = new Set<string>();
    const subs: ControlSubRow[] = [];

    for (const [pid, amt] of byParty) {
      const p = partyById.get(pid);
      const balance = naturalBalance(c.normal_side, amt.debit, amt.credit);
      if (Math.abs(amt.debit) < 0.005 && Math.abs(amt.credit) < 0.005) continue;
      subs.push({
        party_code: p?.party_code ?? pid,
        party_name: p?.party_name ?? "Unknown party",
        debit: amt.debit,
        credit: amt.credit,
        balance,
      });
      seen.add(pid);
    }

    if (opts?.includeZeroParties) {
      for (const p of parties) {
        if (p.role !== c.party_role || seen.has(p.id)) continue;
        subs.push({
          party_code: p.party_code,
          party_name: p.party_name,
          debit: 0,
          credit: 0,
          balance: 0,
        });
      }
    }

    subs.sort((a, b) => a.party_name.localeCompare(b.party_name));
    const sub_total = subs.reduce((s, r) => s + r.balance, 0);
    const composed = Math.abs(sub_total + unallocated - control_balance) < 0.005;

    return {
      account_code: c.account_code,
      account_name: c.account_name,
      account_type: c.account_type,
      caption: c.caption,
      party_role: c.party_role,
      normal_side: c.normal_side,
      debit,
      credit,
      control_balance,
      unallocated,
      unallocated_debit,
      unallocated_credit,
      sub_total,
      composed,
      subs,
    };
  });
}

export async function getJournalRegister(range?: DateRange) {
  const dc = dateClause(range, 1);
  return query<{
    id: string;
    voucher_number: string;
    voucher_date: string;
    voucher_type: string;
    description: string;
    total: string;
  }>(
    `SELECT je.id, je.voucher_number, je.voucher_date::text, je.voucher_type,
            je.description, COALESCE(SUM(jl.debit), 0)::text AS total
     FROM accounting.journal_entries je
     LEFT JOIN accounting.journal_lines jl ON jl.journal_entry_id = je.id
     WHERE je.status = 'POSTED'${dc.sql}
     GROUP BY je.id
     ORDER BY je.voucher_date DESC, je.created_at DESC`,
    dc.params,
  );
}

export interface SalesInvoiceReportRow {
  id: string;
  invoice_number: string;
  invoice_date: string;
  kind: "PROCESS" | "MANUAL";
  customer_name: string;
  payment_type: string;
  net_amount: string;
  voucher_number: string | null;
  journal_entry_id: string | null;
  do_number: string | null;
}

/** System-locked and manual sales invoices for the hyperlinked invoice report. */
export async function listSalesInvoiceReport(range?: DateRange): Promise<SalesInvoiceReportRow[]> {
  const from = range?.from || null;
  const to = range?.to || null;
  return query<SalesInvoiceReportRow>(
    `SELECT id, invoice_number, invoice_date, kind, customer_name, payment_type,
            net_amount, voucher_number, journal_entry_id, do_number
     FROM (
       SELECT d.id, d.invoice_number, d.dispatch_date::text AS invoice_date,
              'PROCESS'::text AS kind, p.party_name AS customer_name, d.payment_type,
              d.amount::text AS net_amount, je.voucher_number, d.journal_entry_id,
              d.do_number
       FROM sales.dispatches d
       JOIN master.parties p ON p.id = d.customer_id
       LEFT JOIN accounting.journal_entries je ON je.id = d.journal_entry_id
       WHERE ($1::date IS NULL OR d.dispatch_date >= $1::date)
         AND ($2::date IS NULL OR d.dispatch_date <= $2::date)
       UNION ALL
       SELECT m.id, m.invoice_number, m.invoice_date::text,
              'MANUAL'::text, p.party_name, m.payment_type,
              m.net_amount::text, je.voucher_number, m.journal_entry_id,
              NULL::varchar(100)
       FROM sales.manual_invoices m
       JOIN master.parties p ON p.id = m.customer_id
       LEFT JOIN accounting.journal_entries je ON je.id = m.journal_entry_id
       WHERE ($1::date IS NULL OR m.invoice_date >= $1::date)
         AND ($2::date IS NULL OR m.invoice_date <= $2::date)
     ) invoices
     ORDER BY invoice_date DESC, invoice_number DESC
     LIMIT 300`,
    [from, to],
  );
}

export async function getProfitLoss(range?: DateRange) {
  const dc = dateClause(range, 1);
  const rows = await query<{ account_type: string; amount: string }>(
    `SELECT a.account_type,
            SUM(CASE WHEN a.account_type='INCOME' THEN jl.credit - jl.debit
                     ELSE jl.debit - jl.credit END)::text AS amount
     FROM accounting.journal_lines jl
     JOIN accounting.journal_entries je ON je.id = jl.journal_entry_id AND je.status='POSTED'
     JOIN accounting.accounts a ON a.id = jl.account_id
     WHERE a.account_type IN ('INCOME','EXPENSE')${dc.sql}
     GROUP BY a.account_type`,
    dc.params,
  );
  const map: Record<string, number> = {};
  for (const r of rows) map[r.account_type] = Number(r.amount);
  const income = map.INCOME ?? 0;
  const expense = map.EXPENSE ?? 0;
  return { income, expense, net: income - expense };
}

export async function getProductionCostReport() {
  return query<{
    po_number: string;
    planned_quantity: string;
    actual_quantity: string;
    grey: string;
    processing: string;
    normal_loss: string;
    stitching: string;
    total_cost: string;
    finished_qty: string;
    cost_per_unit: string;
  }>(
    `SELECT po.po_number,
            po.planned_quantity::text,
            po.actual_quantity::text,
            COALESCE(SUM(pc.amount) FILTER (WHERE pc.cost_type='GREY'), 0)::text        AS grey,
            COALESCE(SUM(pc.amount) FILTER (WHERE pc.cost_type='PROCESSING'), 0)::text  AS processing,
            COALESCE(SUM(pc.amount) FILTER (WHERE pc.cost_type='NORMAL_LOSS'), 0)::text AS normal_loss,
            COALESCE(SUM(pc.amount) FILTER (WHERE pc.cost_type='STITCHING'), 0)::text   AS stitching,
            COALESCE(SUM(pc.amount), 0)::text AS total_cost,
            COALESCE(fg.qty, 0)::text AS finished_qty,
            CASE WHEN COALESCE(fg.qty,0) > 0
                 THEN (COALESCE(SUM(pc.amount),0) / fg.qty)::numeric(18,2)::text
                 ELSE '0' END AS cost_per_unit
     FROM production.production_orders po
     LEFT JOIN production.production_costs pc ON pc.production_order_id = po.id
     LEFT JOIN (
        SELECT production_order_id, SUM(quantity) AS qty
        FROM production.finished_goods_receipts GROUP BY production_order_id
     ) fg ON fg.production_order_id = po.id
     GROUP BY po.id, po.po_number, po.planned_quantity, po.actual_quantity, fg.qty
     ORDER BY po.po_number`,
  );
}

export async function getProfitability() {
  return query<{
    po_number: string;
    revenue: string;
    cost: string;
    profit: string;
  }>(
    `SELECT po.po_number,
            COALESCE(rev.revenue, 0)::text AS revenue,
            COALESCE(SUM(pc.amount), 0)::text AS cost,
            (COALESCE(rev.revenue, 0) - COALESCE(SUM(pc.amount), 0))::text AS profit
     FROM production.production_orders po
     LEFT JOIN production.production_costs pc ON pc.production_order_id = po.id
     LEFT JOIN (
        SELECT je.reference_id AS sale_order_id, SUM(jl.credit) AS revenue
        FROM accounting.journal_entries je
        JOIN accounting.journal_lines jl ON jl.journal_entry_id = je.id
        JOIN accounting.accounts a ON a.id = jl.account_id AND a.account_code = '4000'
        WHERE je.voucher_type = 'SALE' AND je.status = 'POSTED'
        GROUP BY je.reference_id
     ) rev ON rev.sale_order_id = po.sale_order_id
     GROUP BY po.id, po.po_number, rev.revenue
     ORDER BY po.po_number`,
  );
}

// ---------------------------------------------------------------------------
// List helpers for the UI dropdowns / tables
// ---------------------------------------------------------------------------

export async function getPartiesByRole(role: string) {
  return query<{ party_code: string; party_name: string }>(
    `SELECT p.party_code, p.party_name FROM master.parties p
     JOIN master.party_roles r ON r.party_id = p.id
     WHERE r.role = $1 AND p.status = 'ACTIVE' ORDER BY p.party_name`,
    [role],
  );
}

export async function getDesigns() {
  return query<{ design_code: string; design_name: string; standard_consumption: string }>(
    `SELECT design_code, design_name, COALESCE(standard_consumption,0)::text AS standard_consumption
     FROM master.designs WHERE status = 'ACTIVE' ORDER BY design_name`,
  );
}

export async function getItemsByType(type: string) {
  return query<{ item_code: string; item_name: string }>(
    `SELECT item_code, item_name FROM master.items
     WHERE item_type = $1 AND status = 'ACTIVE' ORDER BY item_name`,
    [type],
  );
}

export async function getAvailableGreyLots() {
  return query<{ id: string; lot_number: string; item_name: string; available: string }>(
    `SELECT gl.id, gl.lot_number, it.item_name,
            inventory.get_location_stock(gl.item_id, gl.id,
              (SELECT id FROM inventory.locations WHERE location_code='OWNER_GREY'))::text AS available
     FROM inventory.grey_lots gl
     JOIN master.items it ON it.id = gl.item_id
     ORDER BY gl.created_at DESC`,
  );
}

export async function getSaleOrders() {
  return query<{
    id: string;
    so_number: string;
    order_date: string;
    buyer: string;
    status: string;
    amount: string;
    attach_count: number;
  }>(
    `SELECT so.id, so.so_number, so.order_date::text, p.party_name AS buyer, so.status,
            COALESCE(SUM(soi.amount), 0)::text AS amount,
            (SELECT COUNT(*)::int FROM master.document_files df
              WHERE df.entity_type = 'SALE_ORDER' AND df.entity_id = so.id) AS attach_count
     FROM sales.sale_orders so
     JOIN master.parties p ON p.id = so.buyer_id
     LEFT JOIN sales.sale_order_items soi ON soi.sale_order_id = so.id
     GROUP BY so.id, so.so_number, so.order_date, p.party_name, so.status
     ORDER BY so.created_at DESC`,
  );
}

export async function getProductionOrders() {
  return query<{
    id: string;
    po_number: string;
    sale_order: string;
    planned_quantity: string;
    actual_quantity: string;
    status: string;
    attach_count: number;
  }>(
    `SELECT po.id, po.po_number, so.so_number AS sale_order,
            po.planned_quantity::text, COALESCE(po.actual_quantity,0)::text AS actual_quantity, po.status,
            (SELECT COUNT(*)::int FROM master.document_files df
              WHERE df.entity_type = 'PRODUCTION_ORDER' AND df.entity_id = po.id) AS attach_count
     FROM production.production_orders po
     JOIN sales.sale_orders so ON so.id = po.sale_order_id
     ORDER BY po.created_at DESC`,
  );
}

export async function getProcessingOrders() {
  return query<{
    id: string;
    processing_order_number: string;
    processor: string;
    production_order: string;
    issued: string;
    processed: string;
    shortage: string;
    status: string;
  }>(
    `SELECT po.id, po.processing_order_number, p.party_name AS processor,
            pr.po_number AS production_order,
            COALESCE(SUM(pol.issued_quantity),0)::text AS issued,
            COALESCE(SUM(pol.processed_quantity),0)::text AS processed,
            COALESCE(SUM(pol.shortage_quantity),0)::text AS shortage,
            po.status
     FROM production.processing_orders po
     JOIN master.parties p ON p.id = po.processor_id
     LEFT JOIN production.production_orders pr ON pr.id = po.production_order_id
     LEFT JOIN production.processing_order_lots pol ON pol.processing_order_id = po.id
     GROUP BY po.id, po.processing_order_number, p.party_name, pr.po_number, po.status
     ORDER BY po.issue_date DESC`,
  );
}

export async function getProcessingOrderLots() {
  return query<{
    id: string;
    processing_order_number: string;
    issued: string;
    status: string;
  }>(
    `SELECT pol.id, po.processing_order_number,
            pol.issued_quantity::text AS issued, pol.status
     FROM production.processing_order_lots pol
     JOIN production.processing_orders po ON po.id = pol.processing_order_id
     WHERE pol.status = 'OPEN'
     ORDER BY po.issue_date DESC`,
  );
}

export async function getStitchingOrders() {
  return query<{
    id: string;
    stitching_order_number: string;
    stitcher: string;
    production_order: string;
    status: string;
  }>(
    `SELECT sto.id, sto.stitching_order_number, p.party_name AS stitcher,
            pr.po_number AS production_order, sto.status
     FROM production.stitching_orders sto
     JOIN master.parties p ON p.id = sto.stitcher_id
     LEFT JOIN production.production_orders pr ON pr.id = sto.production_order_id
     ORDER BY sto.issue_date DESC`,
  );
}

export async function getGreyPurchases() {
  return query<{
    id: string;
    purchase_number: string;
    supplier: string;
    purchase_date: string;
    total_amount: string;
    attach_count: number;
  }>(
    `SELECT gp.id, gp.purchase_number, p.party_name AS supplier, gp.purchase_date::text,
            gp.total_amount::text,
            (SELECT COUNT(*)::int FROM master.document_files df
              WHERE df.entity_type = 'GREY_PURCHASE' AND df.entity_id = gp.id) AS attach_count
     FROM inventory.grey_purchases gp
     JOIN master.parties p ON p.id = gp.supplier_id
     ORDER BY gp.purchase_date DESC, gp.purchase_number DESC
     LIMIT 100`,
  );
}

export async function getProcessingBills() {
  return query<{
    id: string;
    bill_number: string;
    processor: string;
    bill_date: string;
    net_payable: string;
    attach_count: number;
  }>(
    `SELECT b.id, b.bill_number, p.party_name AS processor, b.bill_date::text,
            b.net_payable::text,
            (SELECT COUNT(*)::int FROM master.document_files df
              WHERE df.entity_type = 'PROCESSING_BILL' AND df.entity_id = b.id) AS attach_count
     FROM production.processing_bills b
     JOIN master.parties p ON p.id = b.processor_id
     ORDER BY b.bill_date DESC
     LIMIT 100`,
  );
}

export async function getStitchingBills() {
  return query<{
    id: string;
    bill_number: string;
    stitcher: string;
    bill_date: string;
    net_payable: string;
    attach_count: number;
  }>(
    `SELECT b.id, b.bill_number, p.party_name AS stitcher, b.bill_date::text,
            b.net_payable::text,
            (SELECT COUNT(*)::int FROM master.document_files df
              WHERE df.entity_type = 'STITCHING_BILL' AND df.entity_id = b.id) AS attach_count
     FROM production.stitching_bills b
     JOIN master.parties p ON p.id = b.stitcher_id
     ORDER BY b.bill_date DESC
     LIMIT 100`,
  );
}

export type Organization = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  tax_id: string | null;
  currency: string;
  fiscal_year_start: string | null;
  about: string | null;
};

export async function getOrganization(): Promise<Organization | null> {
  const rows = await query<Organization>(
    `SELECT id, name, address, phone, email, tax_id, currency, fiscal_year_start, about
     FROM master.organization ORDER BY updated_at LIMIT 1`,
  );
  return rows[0] ?? null;
}

export async function getKpis() {
  const rows = await query<{ metric: string; value: string }>(
    `SELECT 'sales' AS metric, COALESCE(SUM(jl.credit),0)::text AS value
       FROM accounting.journal_lines jl
       JOIN accounting.journal_entries je ON je.id=jl.journal_entry_id AND je.status='POSTED'
       JOIN accounting.accounts a ON a.id=jl.account_id AND a.account_code='4000'
     UNION ALL
     SELECT 'expenses', COALESCE(SUM(jl.debit),0)::text
       FROM accounting.journal_lines jl
       JOIN accounting.journal_entries je ON je.id=jl.journal_entry_id AND je.status='POSTED'
       JOIN accounting.accounts a ON a.id=jl.account_id AND a.account_type='EXPENSE'
     UNION ALL
     SELECT 'payables', COALESCE(SUM(jl.credit-jl.debit),0)::text
       FROM accounting.journal_lines jl
       JOIN accounting.journal_entries je ON je.id=jl.journal_entry_id AND je.status='POSTED'
       JOIN accounting.accounts a ON a.id=jl.account_id AND a.account_type='LIABILITY'
     UNION ALL
     SELECT 'receivables', COALESCE(SUM(jl.debit-jl.credit),0)::text
       FROM accounting.journal_lines jl
       JOIN accounting.journal_entries je ON je.id=jl.journal_entry_id AND je.status='POSTED'
       JOIN accounting.accounts a ON a.id=jl.account_id AND a.account_code='1100'`,
  );
  const map: Record<string, number> = {};
  for (const r of rows) map[r.metric] = Number(r.value);
  return {
    sales: map.sales ?? 0,
    expenses: map.expenses ?? 0,
    profit: (map.sales ?? 0) - (map.expenses ?? 0),
    payables: map.payables ?? 0,
    receivables: map.receivables ?? 0,
  };
}

// ===========================================================================
// Chart of accounts + manual journal vouchers (conventional double entry)
// ===========================================================================

export interface AccountRow {
  id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  is_postable: boolean;
  status: string;
  cash_bank: string | null;
}

export async function listAccounts(): Promise<AccountRow[]> {
  return query<AccountRow>(
    `SELECT id, account_code, account_name, account_type, is_postable, status, cash_bank
     FROM accounting.accounts
     ORDER BY account_code`,
  );
}

/** Postable accounts, for the voucher line LOV. */
export async function getPostableAccounts() {
  return query<FilterableAccount>(
    `SELECT account_code, account_name, account_type, cash_bank
     FROM accounting.accounts
     WHERE is_postable = TRUE AND status = 'ACTIVE'
     ORDER BY account_code`,
  );
}

/** All parties (any role), for the optional party LOV on voucher lines. */
export async function getAllParties() {
  return query<{ party_code: string; party_name: string }>(
    `SELECT party_code, party_name FROM master.parties
     WHERE status = 'ACTIVE' ORDER BY party_name`,
  );
}

export interface ManualJournalLineInput {
  accountCode: string;
  partyCode?: string | null;
  debit?: number;
  credit?: number;
  amount?: number;
  description?: string;
}

function linesForVoucherType(
  voucherType: ManualVoucherType,
  input: {
    treasuryAccountCode?: string | null;
    lines: ManualJournalLineInput[];
  },
): ManualJournalLineInput[] {
  if (formModeForType(voucherType) === "journal") return input.lines;
  return expandCashBankLines({
    voucherType,
    treasuryAccountCode: input.treasuryAccountCode ?? "",
    lines: input.lines.map((l) => ({
      accountCode: l.accountCode,
      partyCode: l.partyCode,
      amount: Number(l.amount ?? l.debit ?? l.credit ?? 0),
      description: l.description,
    })),
  }).map((l) => ({
    accountCode: l.accountCode,
    partyCode: l.partyCode,
    debit: l.debit,
    credit: l.credit,
    description: l.description ?? undefined,
  }));
}

function normalizeManualLines(lines: ManualJournalLineInput[]) {
  const clean = (lines ?? [])
    .map((l) => ({
      accountCode: l.accountCode,
      partyCode: l.partyCode || null,
      debit: round2(Number(l.debit ?? 0)),
      credit: round2(Number(l.credit ?? 0)),
      description: (l.description ?? "").trim().slice(0, 25) || null,
    }))
    .filter((l) => l.accountCode && (l.debit > 0 || l.credit > 0));

  if (clean.length < 2) {
    throw new Error("A voucher needs at least two lines with an account and an amount.");
  }
  for (const l of clean) {
    if (l.debit > 0 && l.credit > 0) {
      throw new Error("Each line may carry either a debit or a credit, not both.");
    }
  }
  const totalDebit = round2(clean.reduce((s, l) => s + l.debit, 0));
  const totalCredit = round2(clean.reduce((s, l) => s + l.credit, 0));
  if (Math.abs(totalDebit - totalCredit) > 0.005) {
    throw new Error(
      `Voucher is not balanced — total debit ${totalDebit} vs total credit ${totalCredit}.`,
    );
  }
  return { clean, totalDebit, totalCredit };
}

async function insertManualLines(
  client: PoolClient,
  entryId: string,
  clean: ReturnType<typeof normalizeManualLines>["clean"],
) {
  let n = 0;
  for (const l of clean) {
    n += 1;
    const accountId = await accountIdByCode(client, l.accountCode);
    const partyId = l.partyCode ? await partyIdByCode(client, l.partyCode) : null;
    await client.query(
      `INSERT INTO accounting.journal_lines
         (journal_entry_id, line_number, account_id, party_id, debit, credit, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [entryId, n, accountId, partyId, l.debit, l.credit, l.description],
    );
  }
}

/** Create a manual multi-line journal voucher; optionally post it immediately. */
export async function createManualJournal(input: {
  voucherDate: string;
  description?: string;
  post?: boolean;
  voucherType?: string;
  treasuryAccountCode?: string | null;
  lines: ManualJournalLineInput[];
}) {
  const voucherType = normalizeManualVoucherType(input.voucherType);
  const { clean, totalDebit } = normalizeManualLines(linesForVoucherType(voucherType, input));
  return withTransaction(async (client) => {
    await assertTreasuryAccount(client, voucherType, input.treasuryAccountCode);
    const voucherNumber = await nextVoucherNumber(client, voucherType);
    const entryRes = await client.query(
      `INSERT INTO accounting.journal_entries
         (voucher_number, voucher_date, voucher_type, reference_type, description)
       VALUES ($1, $2, $3, 'MANUAL', $4) RETURNING id, voucher_number`,
      [
        voucherNumber,
        input.voucherDate,
        voucherType,
        input.description ?? `${voucherType} voucher`,
      ],
    );
    const entryId = entryRes.rows[0].id as string;
    await insertManualLines(client, entryId, clean);
    if (input.post) {
      const adminId = await getAdminUserId(client);
      await client.query("SELECT accounting.post_journal_entry($1, $2)", [entryId, adminId]);
    }
    return {
      journalEntryId: entryId,
      voucherNumber: entryRes.rows[0].voucher_number as string,
      voucherType,
      status: input.post ? "POSTED" : "DRAFT",
      amount: totalDebit,
    };
  });
}

/** Edit a DRAFT manual voucher (replaces its lines). Posted vouchers must be unposted first. */
export async function updateManualJournal(input: {
  id: string;
  voucherDate: string;
  description?: string;
  post?: boolean;
  voucherType?: string;
  treasuryAccountCode?: string | null;
  lines: ManualJournalLineInput[];
}) {
  const voucherType = normalizeManualVoucherType(input.voucherType);
  const { clean, totalDebit } = normalizeManualLines(linesForVoucherType(voucherType, input));
  return withTransaction(async (client) => {
    const cur = await client.query(
      "SELECT status, reference_type, voucher_type FROM accounting.journal_entries WHERE id=$1",
      [input.id],
    );
    if (cur.rows.length === 0) throw new Error("Voucher not found.");
    if (cur.rows[0].status !== "DRAFT") {
      throw new Error("Only DRAFT vouchers can be edited. Ask an admin to unpost it first.");
    }
    if (cur.rows[0].reference_type !== "MANUAL") {
      throw new Error("Only manual vouchers can be edited here; this one was generated by a transaction.");
    }
    await assertTreasuryAccount(client, voucherType, input.treasuryAccountCode);
    await client.query("DELETE FROM accounting.journal_lines WHERE journal_entry_id=$1", [input.id]);
    await client.query(
      "UPDATE accounting.journal_entries SET voucher_date=$2, description=$3, voucher_type=$4 WHERE id=$1",
      [input.id, input.voucherDate, input.description ?? `${voucherType} voucher`, voucherType],
    );
    await insertManualLines(client, input.id, clean);
    if (input.post) {
      const adminId = await getAdminUserId(client);
      await client.query("SELECT accounting.post_journal_entry($1, $2)", [input.id, adminId]);
    }
    return {
      journalEntryId: input.id,
      status: input.post ? "POSTED" : "DRAFT",
      amount: totalDebit,
      voucherType,
    };
  });
}

/** Post a DRAFT voucher (validates debit = credit). Any authenticated user may post. */
export async function postJournalEntry(input: { id: string }) {
  return withTransaction(async (client) => {
    const cur = await client.query(
      "SELECT status FROM accounting.journal_entries WHERE id=$1",
      [input.id],
    );
    if (cur.rows.length === 0) throw new Error("Voucher not found.");
    if (cur.rows[0].status === "POSTED") throw new Error("Voucher is already posted.");
    const adminId = await getAdminUserId(client);
    await client.query("SELECT accounting.post_journal_entry($1, $2)", [input.id, adminId]);
    return { ok: true, status: "POSTED" };
  });
}

export interface JournalDetail {
  header: {
    id: string;
    voucher_number: string;
    voucher_date: string;
    voucher_type: string;
    reference_type: string | null;
    description: string | null;
    status: string;
    posted_at: string | null;
  } | null;
  lines: {
    line_number: number;
    account_code: string;
    account_name: string;
    party_code: string | null;
    party_name: string | null;
    debit: string;
    credit: string;
    description: string | null;
  }[];
  totalDebit: number;
  totalCredit: number;
  editable: boolean;
}

export async function getJournalEntry(id: string): Promise<JournalDetail> {
  const headerRows = await query<JournalDetail["header"] & object>(
    `SELECT id, voucher_number, voucher_date::text, voucher_type, reference_type,
            description, status, posted_at::text
     FROM accounting.journal_entries WHERE id = $1`,
    [id],
  );
  const header = headerRows[0] ?? null;
  const lines = header
    ? await query<JournalDetail["lines"][number]>(
        `SELECT jl.line_number, a.account_code, a.account_name, p.party_code, p.party_name,
                jl.debit::text, jl.credit::text, jl.description
         FROM accounting.journal_lines jl
         JOIN accounting.accounts a ON a.id = jl.account_id
         LEFT JOIN master.parties p ON p.id = jl.party_id
         WHERE jl.journal_entry_id = $1
         ORDER BY jl.line_number`,
        [id],
      )
    : [];
  const totalDebit = lines.reduce((s, l) => s + Number(l.debit), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit), 0);
  return {
    header,
    lines,
    totalDebit,
    totalCredit,
    editable:
      !!header &&
      header.status === "DRAFT" &&
      header.reference_type === "MANUAL",
  };
}

export async function getJournalEntriesList(
  range?: DateRange,
  voucherType?: string,
) {
  const dc = dateClause(range, 1);
  const params = [...dc.params];
  let typeSql = "";
  const filter = (voucherType ?? "").trim().toUpperCase();
  if (filter === "JV") {
    typeSql = ` AND je.voucher_type IN ('JV', 'MANUAL')`;
  } else if (isManualVoucherType(filter)) {
    params.push(filter);
    typeSql = ` AND je.voucher_type = $${params.length}`;
  } else if (filter === "SYSTEM") {
    typeSql = ` AND je.voucher_type NOT IN ('JV', 'MANUAL', 'CR', 'CP', 'BR', 'BP')`;
  }
  return query<{
    id: string;
    voucher_number: string;
    voucher_date: string;
    voucher_type: string;
    reference_type: string | null;
    status: string;
    total: string;
    attach_count: number;
  }>(
    `SELECT je.id, je.voucher_number, je.voucher_date::text, je.voucher_type,
            je.reference_type, je.status,
            COALESCE(SUM(jl.debit), 0)::text AS total,
            (SELECT COUNT(*)::int FROM master.document_files df
              WHERE df.entity_type = 'JOURNAL' AND df.entity_id = je.id) AS attach_count
     FROM accounting.journal_entries je
     LEFT JOIN accounting.journal_lines jl ON jl.journal_entry_id = je.id
     WHERE TRUE${dc.sql}${typeSql}
     GROUP BY je.id
     ORDER BY je.created_at DESC
     LIMIT 200`,
    params,
  );
}

/** Account ledger — every posted posting to one account (source drill-down). */
export async function getAccountLedger(code: string, range?: DateRange) {
  const dc = dateClause(range, 2);
  const accountRows = await query<{ account_code: string; account_name: string; account_type: string }>(
    "SELECT account_code, account_name, account_type FROM accounting.accounts WHERE account_code=$1",
    [code],
  );
  const rows = await query<{
    id: string;
    voucher_number: string;
    voucher_date: string;
    voucher_type: string;
    party_name: string | null;
    description: string | null;
    debit: string;
    credit: string;
  }>(
    `SELECT je.id, je.voucher_number, je.voucher_date::text, je.voucher_type,
            p.party_name, jl.description, jl.debit::text, jl.credit::text
     FROM accounting.journal_lines jl
     JOIN accounting.journal_entries je ON je.id = jl.journal_entry_id AND je.status='POSTED'
     JOIN accounting.accounts a ON a.id = jl.account_id AND a.account_code = $1
     LEFT JOIN master.parties p ON p.id = jl.party_id
     WHERE TRUE${dc.sql}
     ORDER BY je.voucher_date, je.created_at`,
    [code, ...dc.params],
  );
  return { account: accountRows[0] ?? null, rows };
}

/** Party ledger — every posted posting for one party (source drill-down). */
export async function getPartyLedgerDetail(code: string, range?: DateRange) {
  const dc = dateClause(range, 2);
  const partyRows = await query<{ party_code: string; party_name: string }>(
    "SELECT party_code, party_name FROM master.parties WHERE party_code=$1",
    [code],
  );
  const rows = await query<{
    id: string;
    voucher_number: string;
    voucher_date: string;
    voucher_type: string;
    account_name: string;
    description: string | null;
    debit: string;
    credit: string;
  }>(
    `SELECT je.id, je.voucher_number, je.voucher_date::text, je.voucher_type,
            a.account_name, jl.description, jl.debit::text, jl.credit::text
     FROM accounting.journal_lines jl
     JOIN accounting.journal_entries je ON je.id = jl.journal_entry_id AND je.status='POSTED'
     JOIN master.parties p ON p.id = jl.party_id AND p.party_code = $1
     JOIN accounting.accounts a ON a.id = jl.account_id
     WHERE TRUE${dc.sql}
     ORDER BY je.voucher_date, je.created_at`,
    [code, ...dc.params],
  );
  return { party: partyRows[0] ?? null, rows };
}
