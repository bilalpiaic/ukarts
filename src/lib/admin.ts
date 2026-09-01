import { query, withTransaction } from "./db";

// ---------------------------------------------------------------------------
// Organization
// ---------------------------------------------------------------------------
export async function updateOrganization(input: {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  tax_id?: string;
  currency?: string;
}) {
  const rows = await query<{ id: string }>(
    "SELECT id FROM master.organization ORDER BY updated_at LIMIT 1",
  );
  if (rows.length === 0) {
    await query(
      `INSERT INTO master.organization (name, address, phone, email, tax_id, currency)
       VALUES ($1,$2,$3,$4,$5,COALESCE($6,'PKR'))`,
      [input.name, input.address, input.phone, input.email, input.tax_id, input.currency],
    );
  } else {
    await query(
      `UPDATE master.organization
       SET name=$1, address=$2, phone=$3, email=$4, tax_id=$5,
           currency=COALESCE($6,currency), updated_at=NOW()
       WHERE id=$7`,
      [input.name, input.address, input.phone, input.email, input.tax_id, input.currency, rows[0].id],
    );
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Parties
// ---------------------------------------------------------------------------
export async function listParties() {
  return query<{
    id: string;
    party_code: string;
    party_name: string;
    phone: string | null;
    email: string | null;
    status: string;
    roles: string;
  }>(
    `SELECT p.id, p.party_code, p.party_name, p.phone, p.email, p.status,
            COALESCE(string_agg(DISTINCT r.role, ', '), '') AS roles
     FROM master.parties p
     LEFT JOIN master.party_roles r ON r.party_id = p.id
     GROUP BY p.id ORDER BY p.party_name`,
  );
}

export async function createParty(input: {
  party_code: string;
  party_name: string;
  role: string;
  phone?: string;
  email?: string;
  address?: string;
}) {
  return withTransaction(async (client) => {
    const res = await client.query(
      `INSERT INTO master.parties (party_code, party_name, phone, email, address)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [input.party_code, input.party_name, input.phone, input.email, input.address],
    );
    if (input.role) {
      await client.query(
        `INSERT INTO master.party_roles (party_id, role) VALUES ($1,$2)
         ON CONFLICT (party_id, role) DO NOTHING`,
        [res.rows[0].id, input.role],
      );
    }
    return { id: res.rows[0].id as string };
  });
}

export async function updateParty(input: {
  id: string;
  party_name: string;
  phone?: string;
  email?: string;
  address?: string;
  status?: string;
}) {
  await query(
    `UPDATE master.parties SET party_name=$1, phone=$2, email=$3, address=$4,
       status=COALESCE($5,status), updated_at=NOW() WHERE id=$6`,
    [input.party_name, input.phone, input.email, input.address, input.status, input.id],
  );
  return { ok: true };
}

export async function deleteParty(input: { id: string }) {
  return withTransaction(async (client) => {
    await client.query("DELETE FROM master.party_roles WHERE party_id=$1", [input.id]);
    await client.query("DELETE FROM master.parties WHERE id=$1", [input.id]);
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------
export async function listItems() {
  return query<{
    id: string;
    item_code: string;
    item_name: string;
    item_type: string;
    status: string;
  }>(
    `SELECT id, item_code, item_name, item_type, status
     FROM master.items ORDER BY item_type, item_name`,
  );
}

export async function createItem(input: {
  item_code: string;
  item_name: string;
  item_type: string;
  unit_code: string;
}) {
  return withTransaction(async (client) => {
    const unit = await client.query(
      "SELECT id FROM master.units WHERE unit_code=$1",
      [input.unit_code],
    );
    if (unit.rows.length === 0) throw new Error(`Unit '${input.unit_code}' not found.`);
    const res = await client.query(
      `INSERT INTO master.items (item_code, item_name, item_type, unit_id)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [input.item_code, input.item_name, input.item_type, unit.rows[0].id],
    );
    return { id: res.rows[0].id as string };
  });
}

export async function updateItem(input: {
  id: string;
  item_name: string;
  item_type: string;
  status?: string;
}) {
  await query(
    `UPDATE master.items SET item_name=$1, item_type=$2, status=COALESCE($3,status) WHERE id=$4`,
    [input.item_name, input.item_type, input.status, input.id],
  );
  return { ok: true };
}

export async function deleteItem(input: { id: string }) {
  await query("DELETE FROM master.items WHERE id=$1", [input.id]);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
export async function listUsers() {
  return query<{
    id: string;
    username: string;
    full_name: string;
    role: string;
    status: string;
  }>(`SELECT id, username, full_name, role, status FROM master.users ORDER BY username`);
}

export async function createUser(input: {
  username: string;
  full_name: string;
  role: string;
  password: string;
}) {
  if (!input.password || input.password.length < 4) {
    throw new Error("Password must be at least 4 characters.");
  }
  const res = await query<{ id: string }>(
    `INSERT INTO master.users (username, full_name, role, password_hash)
     VALUES ($1,$2,$3, crypt($4, gen_salt('bf'))) RETURNING id`,
    [input.username, input.full_name, input.role, input.password],
  );
  return { id: res[0].id };
}

export async function updateUser(input: {
  id: string;
  full_name: string;
  role: string;
  status?: string;
  password?: string;
}) {
  if (input.password && input.password.length > 0) {
    await query(
      `UPDATE master.users SET full_name=$1, role=$2, status=COALESCE($3,status),
         password_hash=crypt($4, gen_salt('bf')), updated_at=NOW() WHERE id=$5`,
      [input.full_name, input.role, input.status, input.password, input.id],
    );
  } else {
    await query(
      `UPDATE master.users SET full_name=$1, role=$2, status=COALESCE($3,status),
         updated_at=NOW() WHERE id=$4`,
      [input.full_name, input.role, input.status, input.id],
    );
  }
  return { ok: true };
}

export async function deleteUser(input: { id: string }) {
  const u = await query<{ username: string }>(
    "SELECT username FROM master.users WHERE id=$1",
    [input.id],
  );
  if (u[0]?.username === "admin") {
    throw new Error("The primary admin account cannot be deleted.");
  }
  await query("DELETE FROM master.users WHERE id=$1", [input.id]);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Document void / delete (admin). Removes the document and its postings in one
// transaction; FK constraints prevent deleting documents still referenced
// downstream (the transaction rolls back with a clear message).
// ---------------------------------------------------------------------------
async function deletePostings(
  client: import("pg").PoolClient,
  referenceType: string,
  referenceId: string,
) {
  // Inventory transactions + movements posted for this document.
  const txns = await client.query(
    "SELECT id FROM inventory.inventory_transactions WHERE reference_type=$1 AND reference_id=$2",
    [referenceType, referenceId],
  );
  for (const t of txns.rows) {
    await client.query(
      "DELETE FROM inventory.inventory_movements WHERE inventory_transaction_id=$1",
      [t.id],
    );
  }
  await client.query(
    "DELETE FROM inventory.inventory_transactions WHERE reference_type=$1 AND reference_id=$2",
    [referenceType, referenceId],
  );
  // Journal entries + lines posted for this document.
  const jes = await client.query(
    "SELECT id FROM accounting.journal_entries WHERE reference_type=$1 AND reference_id=$2",
    [referenceType, referenceId],
  );
  for (const j of jes.rows) {
    await client.query("DELETE FROM accounting.journal_lines WHERE journal_entry_id=$1", [j.id]);
  }
  await client.query(
    "DELETE FROM accounting.journal_entries WHERE reference_type=$1 AND reference_id=$2",
    [referenceType, referenceId],
  );
  // Management cost rows.
  await client.query(
    "DELETE FROM production.production_costs WHERE source_id=$1",
    [referenceId],
  );
}

export async function deleteDocument(input: { docType: string; id: string }) {
  return withTransaction(async (client) => {
    switch (input.docType) {
      case "JOURNAL": {
        await client.query("DELETE FROM accounting.journal_lines WHERE journal_entry_id=$1", [input.id]);
        await client.query("DELETE FROM accounting.journal_entries WHERE id=$1", [input.id]);
        break;
      }
      case "GREY_PURCHASE": {
        await deletePostings(client, "GREY_PURCHASE", input.id);
        const lines = await client.query(
          "SELECT id FROM inventory.grey_purchase_lines WHERE purchase_id=$1",
          [input.id],
        );
        for (const l of lines.rows) {
          await client.query("DELETE FROM inventory.grey_lots WHERE purchase_line_id=$1", [l.id]);
        }
        await client.query("DELETE FROM inventory.grey_purchase_lines WHERE purchase_id=$1", [input.id]);
        await client.query("DELETE FROM inventory.grey_purchases WHERE id=$1", [input.id]);
        break;
      }
      case "SALE_ORDER": {
        await deletePostings(client, "SALE_ORDER", input.id);
        await client.query("DELETE FROM inventory.grey_allocations WHERE sale_order_id=$1", [input.id]);
        await client.query("DELETE FROM sales.sale_order_items WHERE sale_order_id=$1", [input.id]);
        await client.query("DELETE FROM sales.sale_orders WHERE id=$1", [input.id]);
        break;
      }
      default:
        throw new Error(`Unsupported document type '${input.docType}'.`);
    }
    return { ok: true };
  }).catch((err: unknown) => {
    const msg = (err as Error).message;
    if (/foreign key|violates/i.test(msg)) {
      throw new Error(
        "Cannot delete: this document is referenced by downstream records. Remove those first.",
      );
    }
    throw err;
  });
}

// Lists for the admin document panel.
export async function listGreyPurchases() {
  return query<{ id: string; purchase_number: string; supplier: string; total_amount: string; status: string }>(
    `SELECT gp.id, gp.purchase_number, p.party_name AS supplier, gp.total_amount::text, gp.status
     FROM inventory.grey_purchases gp JOIN master.parties p ON p.id=gp.supplier_id
     ORDER BY gp.purchase_date DESC`,
  );
}

export async function listJournalVouchers() {
  return query<{ id: string; voucher_number: string; voucher_type: string; voucher_date: string; total: string }>(
    `SELECT je.id, je.voucher_number, je.voucher_type, je.voucher_date::text,
            COALESCE(SUM(jl.debit),0)::text AS total
     FROM accounting.journal_entries je
     LEFT JOIN accounting.journal_lines jl ON jl.journal_entry_id=je.id
     GROUP BY je.id ORDER BY je.created_at DESC LIMIT 30`,
  );
}
