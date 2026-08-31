-- U.K Arts ERP - PostgreSQL schema
-- Transcribed from the Software Design Document (README.md) and made idempotent
-- so it can be applied safely on every environment start.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE SCHEMA IF NOT EXISTS master;
CREATE SCHEMA IF NOT EXISTS sales;
CREATE SCHEMA IF NOT EXISTS inventory;
CREATE SCHEMA IF NOT EXISTS production;
CREATE SCHEMA IF NOT EXISTS accounting;
CREATE SCHEMA IF NOT EXISTS audit;

-- ---------------------------------------------------------------------------
-- Master data
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS master.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) NOT NULL UNIQUE,
    full_name VARCHAR(200) NOT NULL,
    email VARCHAR(200) UNIQUE,
    password_hash TEXT NOT NULL,
    role VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS master.parties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    party_code VARCHAR(50) NOT NULL UNIQUE,
    party_name VARCHAR(250) NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(200),
    address TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS master.party_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    party_id UUID NOT NULL REFERENCES master.parties(id),
    role VARCHAR(50) NOT NULL,
    CONSTRAINT uq_party_role UNIQUE(party_id, role)
);

CREATE TABLE IF NOT EXISTS master.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_code VARCHAR(50) NOT NULL UNIQUE,
    category_name VARCHAR(150) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE IF NOT EXISTS master.qualities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quality_code VARCHAR(50) NOT NULL UNIQUE,
    quality_name VARCHAR(150) NOT NULL,
    category_id UUID NOT NULL REFERENCES master.categories(id),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE IF NOT EXISTS master.units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_code VARCHAR(20) NOT NULL UNIQUE,
    unit_name VARCHAR(100) NOT NULL,
    decimal_precision INTEGER DEFAULT 4
);

CREATE TABLE IF NOT EXISTS master.items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_code VARCHAR(100) NOT NULL UNIQUE,
    item_name VARCHAR(250) NOT NULL,
    item_type VARCHAR(50) NOT NULL,
    category_id UUID REFERENCES master.categories(id),
    quality_id UUID REFERENCES master.qualities(id),
    unit_id UUID NOT NULL REFERENCES master.units(id),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE IF NOT EXISTS master.designs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    design_code VARCHAR(100) NOT NULL UNIQUE,
    design_name VARCHAR(250) NOT NULL,
    category_id UUID REFERENCES master.categories(id),
    standard_consumption NUMERIC(18,4),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE IF NOT EXISTS inventory.locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_code VARCHAR(100) NOT NULL UNIQUE,
    location_name VARCHAR(250) NOT NULL,
    location_type VARCHAR(50) NOT NULL,
    party_id UUID REFERENCES master.parties(id),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
);

-- ---------------------------------------------------------------------------
-- Sales
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales.sale_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    so_number VARCHAR(100) NOT NULL UNIQUE,
    order_date DATE NOT NULL,
    buyer_id UUID NOT NULL REFERENCES master.parties(id),
    delivery_date DATE,
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    remarks TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales.sale_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_order_id UUID NOT NULL REFERENCES sales.sale_orders(id),
    design_id UUID REFERENCES master.designs(id),
    item_id UUID NOT NULL REFERENCES master.items(id),
    ordered_quantity NUMERIC(18,4) NOT NULL CHECK(ordered_quantity > 0),
    rate NUMERIC(18,2),
    amount NUMERIC(18,2)
);

-- ---------------------------------------------------------------------------
-- Production
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS production.production_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_number VARCHAR(100) NOT NULL UNIQUE,
    sale_order_id UUID NOT NULL REFERENCES sales.sale_orders(id),
    design_id UUID REFERENCES master.designs(id),
    planned_quantity NUMERIC(18,4) NOT NULL,
    actual_quantity NUMERIC(18,4) DEFAULT 0,
    start_date DATE,
    planned_completion_date DATE,
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS production.production_bom (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    production_order_id UUID NOT NULL REFERENCES production.production_orders(id),
    item_id UUID NOT NULL REFERENCES master.items(id),
    quantity_per_unit NUMERIC(18,4) NOT NULL,
    planned_quantity NUMERIC(18,4) NOT NULL,
    total_required_quantity NUMERIC(18,4) NOT NULL
);

-- ---------------------------------------------------------------------------
-- Grey purchase and lot management
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory.grey_purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_number VARCHAR(100) NOT NULL UNIQUE,
    supplier_id UUID NOT NULL REFERENCES master.parties(id),
    purchase_date DATE NOT NULL,
    supplier_bill_number VARCHAR(100),
    total_amount NUMERIC(18,2) DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
);

CREATE TABLE IF NOT EXISTS inventory.grey_purchase_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_id UUID NOT NULL REFERENCES inventory.grey_purchases(id),
    item_id UUID NOT NULL REFERENCES master.items(id),
    quantity NUMERIC(18,4) NOT NULL CHECK(quantity > 0),
    rate NUMERIC(18,2) NOT NULL,
    amount NUMERIC(18,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS inventory.grey_lots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lot_number VARCHAR(100) NOT NULL UNIQUE,
    purchase_line_id UUID NOT NULL REFERENCES inventory.grey_purchase_lines(id),
    item_id UUID NOT NULL REFERENCES master.items(id),
    original_quantity NUMERIC(18,4) NOT NULL,
    purchase_rate NUMERIC(18,2) NOT NULL,
    original_value NUMERIC(18,2) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Inventory ledger
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory.inventory_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_number VARCHAR(100) NOT NULL UNIQUE,
    transaction_type VARCHAR(50) NOT NULL,
    transaction_date DATE NOT NULL,
    reference_type VARCHAR(50),
    reference_id UUID,
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    posted_at TIMESTAMPTZ,
    posted_by UUID REFERENCES master.users(id),
    remarks TEXT
);

CREATE TABLE IF NOT EXISTS inventory.inventory_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_transaction_id UUID NOT NULL REFERENCES inventory.inventory_transactions(id),
    movement_date DATE NOT NULL,
    item_id UUID NOT NULL REFERENCES master.items(id),
    lot_id UUID REFERENCES inventory.grey_lots(id),
    sale_order_id UUID REFERENCES sales.sale_orders(id),
    production_order_id UUID REFERENCES production.production_orders(id),
    from_location_id UUID REFERENCES inventory.locations(id),
    to_location_id UUID REFERENCES inventory.locations(id),
    quantity NUMERIC(18,4) NOT NULL CHECK(quantity > 0),
    rate NUMERIC(18,2),
    value NUMERIC(18,2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory.grey_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grey_lot_id UUID NOT NULL REFERENCES inventory.grey_lots(id),
    sale_order_id UUID NOT NULL REFERENCES sales.sale_orders(id),
    production_order_id UUID NOT NULL REFERENCES production.production_orders(id),
    allocated_quantity NUMERIC(18,4) NOT NULL CHECK(allocated_quantity > 0),
    allocation_date DATE NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE'
);

-- ---------------------------------------------------------------------------
-- Processing
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS production.processing_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    processing_order_number VARCHAR(100) NOT NULL UNIQUE,
    processor_id UUID NOT NULL REFERENCES master.parties(id),
    sale_order_id UUID REFERENCES sales.sale_orders(id),
    production_order_id UUID REFERENCES production.production_orders(id),
    issue_date DATE NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    remarks TEXT
);

CREATE TABLE IF NOT EXISTS production.processing_order_lots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    processing_order_id UUID NOT NULL REFERENCES production.processing_orders(id),
    grey_lot_id UUID NOT NULL REFERENCES inventory.grey_lots(id),
    issued_quantity NUMERIC(18,4) NOT NULL CHECK(issued_quantity > 0),
    grey_rate NUMERIC(18,2) NOT NULL,
    issued_value NUMERIC(18,2) NOT NULL,
    processed_quantity NUMERIC(18,4) DEFAULT 0,
    returned_quantity NUMERIC(18,4) DEFAULT 0,
    shortage_quantity NUMERIC(18,4) DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'OPEN'
);

CREATE TABLE IF NOT EXISTS production.processing_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_number VARCHAR(100) NOT NULL UNIQUE,
    processing_order_id UUID NOT NULL REFERENCES production.processing_orders(id),
    receipt_date DATE NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
);

CREATE TABLE IF NOT EXISTS production.processing_receipt_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    processing_receipt_id UUID NOT NULL REFERENCES production.processing_receipts(id),
    processing_order_lot_id UUID NOT NULL REFERENCES production.processing_order_lots(id),
    processed_item_id UUID REFERENCES master.items(id),
    processed_quantity NUMERIC(18,4) NOT NULL
);

CREATE TABLE IF NOT EXISTS production.processing_bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_number VARCHAR(100) NOT NULL UNIQUE,
    processor_id UUID NOT NULL REFERENCES master.parties(id),
    processing_order_id UUID NOT NULL REFERENCES production.processing_orders(id),
    bill_date DATE NOT NULL,
    gross_amount NUMERIC(18,2) DEFAULT 0,
    shortage_recovery NUMERIC(18,2) DEFAULT 0,
    other_deductions NUMERIC(18,2) DEFAULT 0,
    net_payable NUMERIC(18,2) DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
);

CREATE TABLE IF NOT EXISTS production.processing_bill_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    processing_bill_id UUID NOT NULL REFERENCES production.processing_bills(id),
    processing_order_lot_id UUID REFERENCES production.processing_order_lots(id),
    quantity NUMERIC(18,4) NOT NULL,
    processing_rate NUMERIC(18,2) NOT NULL,
    amount NUMERIC(18,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS production.processor_shortages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    processing_order_lot_id UUID NOT NULL REFERENCES production.processing_order_lots(id),
    processing_bill_id UUID REFERENCES production.processing_bills(id),
    shortage_quantity NUMERIC(18,4) NOT NULL,
    grey_rate NUMERIC(18,2) NOT NULL,
    shortage_value NUMERIC(18,2) NOT NULL,
    classification VARCHAR(50) NOT NULL,
    recoverable_from_processor BOOLEAN DEFAULT FALSE,
    settlement_status VARCHAR(30) NOT NULL DEFAULT 'OPEN'
);

-- ---------------------------------------------------------------------------
-- Stitching
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS production.stitching_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stitching_order_number VARCHAR(100) NOT NULL UNIQUE,
    stitcher_id UUID NOT NULL REFERENCES master.parties(id),
    production_order_id UUID NOT NULL REFERENCES production.production_orders(id),
    design_id UUID REFERENCES master.designs(id),
    issue_date DATE NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
);

CREATE TABLE IF NOT EXISTS production.stitching_material_issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stitching_order_id UUID NOT NULL REFERENCES production.stitching_orders(id),
    item_id UUID NOT NULL REFERENCES master.items(id),
    lot_id UUID REFERENCES inventory.grey_lots(id),
    quantity NUMERIC(18,4) NOT NULL,
    rate NUMERIC(18,2),
    issue_date DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS production.stitching_production_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_number VARCHAR(100) NOT NULL UNIQUE,
    stitching_order_id UUID NOT NULL REFERENCES production.stitching_orders(id),
    production_date DATE NOT NULL,
    finished_quantity NUMERIC(18,4) NOT NULL,
    accepted_quantity NUMERIC(18,4) DEFAULT 0,
    rejected_quantity NUMERIC(18,4) DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
);

CREATE TABLE IF NOT EXISTS production.stitcher_material_settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stitching_order_id UUID NOT NULL REFERENCES production.stitching_orders(id),
    material_issue_id UUID NOT NULL REFERENCES production.stitching_material_issues(id),
    fabric_consumed NUMERIC(18,4) DEFAULT 0,
    returned_quantity NUMERIC(18,4) DEFAULT 0,
    wastage_quantity NUMERIC(18,4) DEFAULT 0,
    shortage_quantity NUMERIC(18,4) DEFAULT 0,
    wip_quantity NUMERIC(18,4) DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'OPEN'
);

CREATE TABLE IF NOT EXISTS production.stitching_bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_number VARCHAR(100) NOT NULL UNIQUE,
    stitcher_id UUID NOT NULL REFERENCES master.parties(id),
    stitching_order_id UUID NOT NULL REFERENCES production.stitching_orders(id),
    bill_date DATE NOT NULL,
    gross_amount NUMERIC(18,2) DEFAULT 0,
    deductions NUMERIC(18,2) DEFAULT 0,
    net_payable NUMERIC(18,2) DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
);

CREATE TABLE IF NOT EXISTS production.stitching_bill_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stitching_bill_id UUID NOT NULL REFERENCES production.stitching_bills(id),
    quantity NUMERIC(18,4) NOT NULL,
    rate NUMERIC(18,2) NOT NULL,
    amount NUMERIC(18,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS production.finished_goods_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_number VARCHAR(100) NOT NULL UNIQUE,
    production_order_id UUID NOT NULL REFERENCES production.production_orders(id),
    stitching_order_id UUID REFERENCES production.stitching_orders(id),
    item_id UUID NOT NULL REFERENCES master.items(id),
    design_id UUID REFERENCES master.designs(id),
    quantity NUMERIC(18,4) NOT NULL,
    receipt_date DATE NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
);

-- ---------------------------------------------------------------------------
-- Accounting
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounting.accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_code VARCHAR(50) NOT NULL UNIQUE,
    account_name VARCHAR(250) NOT NULL,
    account_type VARCHAR(50) NOT NULL,
    parent_account_id UUID REFERENCES accounting.accounts(id),
    is_postable BOOLEAN DEFAULT TRUE,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE IF NOT EXISTS accounting.journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    voucher_number VARCHAR(100) NOT NULL UNIQUE,
    voucher_date DATE NOT NULL,
    voucher_type VARCHAR(50) NOT NULL,
    reference_type VARCHAR(100),
    reference_id UUID,
    description TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    posted_at TIMESTAMPTZ,
    posted_by UUID REFERENCES master.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    reversal_of_id UUID REFERENCES accounting.journal_entries(id)
);

CREATE TABLE IF NOT EXISTS accounting.journal_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_entry_id UUID NOT NULL REFERENCES accounting.journal_entries(id),
    line_number INTEGER NOT NULL,
    account_id UUID NOT NULL REFERENCES accounting.accounts(id),
    party_id UUID REFERENCES master.parties(id),
    debit NUMERIC(18,2) NOT NULL DEFAULT 0,
    credit NUMERIC(18,2) NOT NULL DEFAULT 0,
    sale_order_id UUID REFERENCES sales.sale_orders(id),
    production_order_id UUID REFERENCES production.production_orders(id),
    description TEXT,
    CONSTRAINT chk_journal_debit_credit CHECK(
        (debit > 0 AND credit = 0)
        OR
        (credit > 0 AND debit = 0)
    ),
    CONSTRAINT uq_journal_line UNIQUE(journal_entry_id, line_number)
);

CREATE TABLE IF NOT EXISTS accounting.posting_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_type VARCHAR(100) NOT NULL,
    debit_account_code VARCHAR(50) NOT NULL,
    credit_account_code VARCHAR(50) NOT NULL,
    description VARCHAR(500),
    active BOOLEAN DEFAULT TRUE,
    CONSTRAINT uq_posting_rule UNIQUE(
        transaction_type,
        debit_account_code,
        credit_account_code
    )
);

CREATE TABLE IF NOT EXISTS production.production_costs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    production_order_id UUID NOT NULL REFERENCES production.production_orders(id),
    cost_type VARCHAR(50) NOT NULL,
    source_type VARCHAR(100),
    source_id UUID,
    amount NUMERIC(18,2) NOT NULL,
    cost_date DATE NOT NULL
);

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES master.users(id),
    table_name VARCHAR(150) NOT NULL,
    record_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL,
    old_data JSONB,
    new_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION inventory.get_location_stock(
    p_item_id UUID,
    p_lot_id UUID,
    p_location_id UUID
)
RETURNS NUMERIC(18,4)
LANGUAGE SQL
AS $$
    SELECT COALESCE(
        SUM(CASE WHEN to_location_id = p_location_id THEN quantity ELSE 0 END)
        -
        SUM(CASE WHEN from_location_id = p_location_id THEN quantity ELSE 0 END),
        0
    )
    FROM inventory.inventory_movements
    WHERE item_id = p_item_id
      AND lot_id IS NOT DISTINCT FROM p_lot_id;
$$;

CREATE OR REPLACE FUNCTION accounting.validate_journal_entry(
    p_journal_entry_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
    total_debit NUMERIC(18,2);
    total_credit NUMERIC(18,2);
BEGIN
    SELECT
        COALESCE(SUM(debit), 0),
        COALESCE(SUM(credit), 0)
    INTO total_debit, total_credit
    FROM accounting.journal_lines
    WHERE journal_entry_id = p_journal_entry_id;

    IF total_debit <> total_credit THEN
        RAISE EXCEPTION
        'Journal entry is not balanced. Debit: %, Credit: %',
        total_debit, total_credit;
    END IF;

    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION accounting.post_journal_entry(
    p_journal_entry_id UUID,
    p_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM accounting.validate_journal_entry(p_journal_entry_id);

    UPDATE accounting.journal_entries
    SET
        status = 'POSTED',
        posted_at = NOW(),
        posted_by = p_user_id
    WHERE id = p_journal_entry_id
      AND status = 'DRAFT';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Journal entry cannot be posted';
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Recommended indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_inventory_movement_item
    ON inventory.inventory_movements(item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movement_lot
    ON inventory.inventory_movements(lot_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movement_po
    ON inventory.inventory_movements(production_order_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movement_so
    ON inventory.inventory_movements(sale_order_id);
CREATE INDEX IF NOT EXISTS idx_processing_order_processor
    ON production.processing_orders(processor_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account
    ON accounting.journal_lines(account_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_party
    ON accounting.journal_lines(party_id);
