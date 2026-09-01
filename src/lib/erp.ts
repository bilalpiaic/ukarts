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
              gl.lot_number, gl.purchase_rate, m.item_id, m.lot_id
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
        opts.date,
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
  return txnId;
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
  return withTransaction(async (client) => {
    const customerId = await partyIdByCode(client, input.customerCode);
    const finishedItemId = await itemIdByCode(client, input.finishedItemCode);
    const finishedGoods = await locationIdByCode(client, "FINISHED_GOODS");
    const amount = round2(input.quantity * input.rate);

    await postInventory(client, {
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

    await postJournal(client, {
      voucherType: "SALE",
      referenceType: "SALE_ORDER",
      referenceId: input.saleOrderId,
      voucherDate: input.date,
      description: `Sale of ${input.quantity} finished goods`,
      lines: [
        {
          accountCode: input.paymentType === "CASH" ? "1000" : "1100",
          debit: amount,
          partyId: input.paymentType === "CREDIT" ? customerId : null,
          saleOrderId: input.saleOrderId,
        },
        {
          accountCode: "4000",
          credit: amount,
          saleOrderId: input.saleOrderId,
        },
      ],
    });

    await client.query(
      "UPDATE sales.sale_orders SET status = 'CLOSED' WHERE id = $1",
      [input.saleOrderId],
    );

    return { amount };
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

export async function getPartyLedgers() {
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
     GROUP BY p.id, p.party_code, p.party_name
     HAVING SUM(jl.debit) <> 0 OR SUM(jl.credit) <> 0
     ORDER BY p.party_name`,
  );
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
  }>(
    `SELECT so.id, so.so_number, so.order_date::text, p.party_name AS buyer, so.status,
            COALESCE(SUM(soi.amount), 0)::text AS amount
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
  }>(
    `SELECT po.id, po.po_number, so.so_number AS sale_order,
            po.planned_quantity::text, COALESCE(po.actual_quantity,0)::text AS actual_quantity, po.status
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
