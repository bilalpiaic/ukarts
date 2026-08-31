U.K Arts ERP Accounting System
Software Design Document (SDD)
Document Type: Software Design Document
System: U.K Arts ERP Accounting System
Database: PostgreSQL
Architecture: Web-Based ERP
Primary Focus: Accounting, Grey Cloth Inventory, Processing, Stitching and Production
Version: 1.0
1. Document Purpose
This SDD defines the technical architecture for managing the complete lifecycle of textile material and garment production, including owner investment, grey cloth purchasing, lot management, sale orders, production orders, processing, processor shortage, stitching, finished goods, double-entry accounting, and production costing.
2. Core Design Principles
Every inventory change requires an inventory ledger entry.
Every financial posting requires a balanced journal entry.
Posted transactions are immutable; corrections use reversal or adjustment transactions.
Grey traceability is maintained by item, category, quality, lot, sale order, production order, party, location, and stage.
PostgreSQL transactions protect critical workflows from partial posting.
3. High-Level Architecture
Frontend (Next.js + TypeScript) → Application/API Layer → Inventory, Production, Costing and Accounting Engines → PostgreSQL Database
4. PostgreSQL Schema Structure
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE SCHEMA master;
CREATE SCHEMA sales;
CREATE SCHEMA inventory;
CREATE SCHEMA production;
CREATE SCHEMA accounting;
CREATE SCHEMA audit;
5. Database Conventions
Primary keys: UUID with gen_random_uuid()
Business dates: DATE
Audit timestamps: TIMESTAMPTZ
Money: NUMERIC(18,2)
Material quantities: NUMERIC(18,4)
6. Master Data Schema
6.1 Users
CREATE TABLE master.users (
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
6.2 Parties
CREATE TABLE master.parties (
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
6.3 Party Roles
CREATE TABLE master.party_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    party_id UUID NOT NULL REFERENCES master.parties(id),
    role VARCHAR(50) NOT NULL,
    CONSTRAINT uq_party_role UNIQUE(party_id, role)
);
Roles: CUSTOMER, GREY_SUPPLIER, PROCESSOR, STITCHER, TRANSPORTER, OTHER_DEBTOR, OTHER_CREDITOR.
6.4 Categories
CREATE TABLE master.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_code VARCHAR(50) NOT NULL UNIQUE,
    category_name VARCHAR(150) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
);
6.5 Qualities
CREATE TABLE master.qualities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quality_code VARCHAR(50) NOT NULL UNIQUE,
    quality_name VARCHAR(150) NOT NULL,
    category_id UUID NOT NULL REFERENCES master.categories(id),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
);
6.6 Units
CREATE TABLE master.units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_code VARCHAR(20) NOT NULL UNIQUE,
    unit_name VARCHAR(100) NOT NULL,
    decimal_precision INTEGER DEFAULT 4
);
6.7 Items
CREATE TABLE master.items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_code VARCHAR(100) NOT NULL UNIQUE,
    item_name VARCHAR(250) NOT NULL,
    item_type VARCHAR(50) NOT NULL,
    category_id UUID REFERENCES master.categories(id),
    quality_id UUID REFERENCES master.qualities(id),
    unit_id UUID NOT NULL REFERENCES master.units(id),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
);
Item types: GREY_CLOTH, PROCESSED_CLOTH, FINISHED_GOOD, OTHER.
6.8 Designs
CREATE TABLE master.designs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    design_code VARCHAR(100) NOT NULL UNIQUE,
    design_name VARCHAR(250) NOT NULL,
    category_id UUID REFERENCES master.categories(id),
    standard_consumption NUMERIC(18,4),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
);
6.9 Inventory Locations
CREATE TABLE inventory.locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_code VARCHAR(100) NOT NULL UNIQUE,
    location_name VARCHAR(250) NOT NULL,
    location_type VARCHAR(50) NOT NULL,
    party_id UUID REFERENCES master.parties(id),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
);
Examples: OWNER_GREY, BG_PROCESSOR, STITCHER, FINISHED_GOODS.
7. Sales Module
7.1 Sale Orders
CREATE TABLE sales.sale_orders (
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
7.2 Sale Order Items
CREATE TABLE sales.sale_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_order_id UUID NOT NULL REFERENCES sales.sale_orders(id),
    design_id UUID REFERENCES master.designs(id),
    item_id UUID NOT NULL REFERENCES master.items(id),
    ordered_quantity NUMERIC(18,4) NOT NULL CHECK(ordered_quantity > 0),
    rate NUMERIC(18,2),
    amount NUMERIC(18,2)
);
8. Production Module
8.1 Production Orders
CREATE TABLE production.production_orders (
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
8.2 Production BOM
CREATE TABLE production.production_bom (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    production_order_id UUID NOT NULL REFERENCES production.production_orders(id),
    item_id UUID NOT NULL REFERENCES master.items(id),
    quantity_per_unit NUMERIC(18,4) NOT NULL,
    planned_quantity NUMERIC(18,4) NOT NULL,
    total_required_quantity NUMERIC(18,4) NOT NULL
);
Example: 1 Ladies 2PC Suit = 5 meters fabric.
9. Grey Purchase and Lot Management
9.1 Purchase Header
CREATE TABLE inventory.grey_purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_number VARCHAR(100) NOT NULL UNIQUE,
    supplier_id UUID NOT NULL REFERENCES master.parties(id),
    purchase_date DATE NOT NULL,
    supplier_bill_number VARCHAR(100),
    total_amount NUMERIC(18,2) DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
);
9.2 Purchase Lines
CREATE TABLE inventory.grey_purchase_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_id UUID NOT NULL REFERENCES inventory.grey_purchases(id),
    item_id UUID NOT NULL REFERENCES master.items(id),
    quantity NUMERIC(18,4) NOT NULL CHECK(quantity > 0),
    rate NUMERIC(18,2) NOT NULL,
    amount NUMERIC(18,2) NOT NULL
);
9.3 Grey Lots
CREATE TABLE inventory.grey_lots (
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
original_quantity is never overwritten. Current stock is calculated from the inventory ledger.
10. Inventory Ledger
10.1 Inventory Transaction Header
CREATE TABLE inventory.inventory_transactions (
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
10.2 Inventory Movement Lines
CREATE TABLE inventory.inventory_movements (
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
Stock Rules
No direct stock balance updates.
Every physical movement creates a ledger movement.
Lot-controlled grey requires lot_id.
Grey movements retain Sale Order and Production Order references.
Negative stock is prohibited.
Posted movements are immutable.
Stock Formula
Current Stock =
Total Quantity Into Location
-
Total Quantity Out of Location
Stock Function
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
11. Grey Allocation
CREATE TABLE inventory.grey_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grey_lot_id UUID NOT NULL REFERENCES inventory.grey_lots(id),
    sale_order_id UUID NOT NULL REFERENCES sales.sale_orders(id),
    production_order_id UUID NOT NULL REFERENCES production.production_orders(id),
    allocated_quantity NUMERIC(18,4) NOT NULL CHECK(allocated_quantity > 0),
    allocation_date DATE NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE'
);
Allocation reserves stock for a Sale Order and Production Order.
12. Processing Module
12.1 Processing Orders
CREATE TABLE production.processing_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    processing_order_number VARCHAR(100) NOT NULL UNIQUE,
    processor_id UUID NOT NULL REFERENCES master.parties(id),
    sale_order_id UUID REFERENCES sales.sale_orders(id),
    production_order_id UUID REFERENCES production.production_orders(id),
    issue_date DATE NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    remarks TEXT
);
12.2 Processing Order Lots
CREATE TABLE production.processing_order_lots (
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
Grey Issue Workflow
Owner Grey Location → Processor Location.
Dimensions retained:
Lot
Quality
Sale Order
Production Order
Processor Reconciliation
Issued
=
Processed
+
Returned
+
Shortage
A processing lot closes only when:
Issued - Processed - Returned - Shortage = 0
13. Processing Receipts
CREATE TABLE production.processing_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_number VARCHAR(100) NOT NULL UNIQUE,
    processing_order_id UUID NOT NULL REFERENCES production.processing_orders(id),
    receipt_date DATE NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
);

CREATE TABLE production.processing_receipt_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    processing_receipt_id UUID NOT NULL REFERENCES production.processing_receipts(id),
    processing_order_lot_id UUID NOT NULL REFERENCES production.processing_order_lots(id),
    processed_item_id UUID REFERENCES master.items(id),
    processed_quantity NUMERIC(18,4) NOT NULL
);
14. Processing Bills
CREATE TABLE production.processing_bills (
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

CREATE TABLE production.processing_bill_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    processing_bill_id UUID NOT NULL REFERENCES production.processing_bills(id),
    processing_order_lot_id UUID REFERENCES production.processing_order_lots(id),
    quantity NUMERIC(18,4) NOT NULL,
    processing_rate NUMERIC(18,2) NOT NULL,
    amount NUMERIC(18,2) NOT NULL
);
Calculation:
Gross Processing Charges
=
Processing Quantity × Processing Rate

Net Payable
=
Gross Charges
- Grey Shortage Recovery
- Other Deductions
15. Shortage Accounting
Shortage is a physical material event. Recovery is a financial settlement event.
CREATE TABLE production.processor_shortages (
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
Classifications:
PROCESSOR_RECOVERABLE
NORMAL_PROCESS_LOSS
ABNORMAL_LOSS
Journal Treatment
Processor Recoverable Shortage
Dr Processor Account
    Cr Grey Consumption
The amount is deductible from the Processor's processing bill.
Normal Process Loss
Dr Production Cost / Normal Loss
    Cr Grey Inventory
Abnormal Loss
Dr Abnormal Loss
    Cr Grey Inventory
16. Stitching Module
16.1 Stitching Orders
CREATE TABLE production.stitching_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stitching_order_number VARCHAR(100) NOT NULL UNIQUE,
    stitcher_id UUID NOT NULL REFERENCES master.parties(id),
    production_order_id UUID NOT NULL REFERENCES production.production_orders(id),
    design_id UUID REFERENCES master.designs(id),
    issue_date DATE NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
);
16.2 Material Issue
CREATE TABLE production.stitching_material_issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stitching_order_id UUID NOT NULL REFERENCES production.stitching_orders(id),
    item_id UUID NOT NULL REFERENCES master.items(id),
    lot_id UUID REFERENCES inventory.grey_lots(id),
    quantity NUMERIC(18,4) NOT NULL,
    rate NUMERIC(18,2),
    issue_date DATE NOT NULL
);
16.3 Production Receipt
CREATE TABLE production.stitching_production_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_number VARCHAR(100) NOT NULL UNIQUE,
    stitching_order_id UUID NOT NULL REFERENCES production.stitching_orders(id),
    production_date DATE NOT NULL,
    finished_quantity NUMERIC(18,4) NOT NULL,
    accepted_quantity NUMERIC(18,4) DEFAULT 0,
    rejected_quantity NUMERIC(18,4) DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
);
Stitcher Reconciliation
Fabric Issued
=
Fabric Consumed
+
Returned Fabric
+
Approved Wastage
+
Shortage
+
Work in Progress
16.4 Material Settlement
CREATE TABLE production.stitcher_material_settlements (
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
16.5 Stitching Bills
CREATE TABLE production.stitching_bills (
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

CREATE TABLE production.stitching_bill_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stitching_bill_id UUID NOT NULL REFERENCES production.stitching_bills(id),
    quantity NUMERIC(18,4) NOT NULL,
    rate NUMERIC(18,2) NOT NULL,
    amount NUMERIC(18,2) NOT NULL
);
17. Finished Goods
CREATE TABLE production.finished_goods_receipts (
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
18. Accounting Schema
18.1 Chart of Accounts
CREATE TABLE accounting.accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_code VARCHAR(50) NOT NULL UNIQUE,
    account_name VARCHAR(250) NOT NULL,
    account_type VARCHAR(50) NOT NULL,
    parent_account_id UUID REFERENCES accounting.accounts(id),
    is_postable BOOLEAN DEFAULT TRUE,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
);
Types: ASSET, LIABILITY, EQUITY, INCOME, EXPENSE.
18.2 Journal Header
CREATE TABLE accounting.journal_entries (
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
18.3 Journal Lines
CREATE TABLE accounting.journal_lines (
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
19. Automatic Journal Entry Engine
Workflow:
Business Transaction
↓
Validation
↓
Database Transaction
↓
Inventory Posting
↓
Journal Entry Creation
↓
Debit/Credit Validation
↓
Post Transaction
Configurable Posting Rules
CREATE TABLE accounting.posting_rules (
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
20. Automatic Journal Rules
Owner Investment
Dr Cash / Bank
    Cr Owner Investment
Grey Purchase
Dr Grey Inventory
    Cr Supplier Payable
Grey Issue to Processor
Normally a custody/location movement only. No normal P&L entry.
Processing Bill
Dr Processing / Production Cost
    Cr Processor Payable
Processor Recoverable Shortage
Dr Processor Account
    Cr Grey Consumption
Normal Process Loss
Dr Production Cost / Normal Loss
    Cr Grey Inventory
Abnormal Loss
Dr Abnormal Loss
    Cr Grey Inventory
Stitching Bill
Dr Production / Finished Goods Cost
    Cr Stitcher Payable
21. Journal Validation Function
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
22. Journal Posting Function
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
23. Production Cost Engine
CREATE TABLE production.production_costs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    production_order_id UUID NOT NULL REFERENCES production.production_orders(id),
    cost_type VARCHAR(50) NOT NULL,
    source_type VARCHAR(100),
    source_id UUID,
    amount NUMERIC(18,2) NOT NULL,
    cost_date DATE NOT NULL
);
Cost types: GREY, PROCESSING, NORMAL_LOSS, STITCHING, OTHER.
Formula:
Grey Material Cost
+ Processing Cost
+ Normal Loss
+ Stitching Cost
+ Other Production Cost
=
Total Production Cost
Cost per unit:
Total Production Cost
÷
Accepted Finished Quantity
=
Cost Per Unit
24. Transaction Status Workflow
DRAFT
↓
APPROVED
↓
POSTED
↓
CLOSED
Optional: CANCELLED.
Only approved documents may be posted. Posted transactions create inventory and accounting entries.
25. Transaction Reversal
Posted transactions must not be edited.
Correction process:
Posted Transaction
↓
Reversal Transaction
↓
Corrected Transaction
26. Audit Log
CREATE TABLE audit.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES master.users(id),
    table_name VARCHAR(150) NOT NULL,
    record_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL,
    old_data JSONB,
    new_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
Actions include: CREATE, UPDATE, DELETE, APPROVE, POST, REVERSE.
27. Critical Database Relationships
PARTY
├── CUSTOMER
├── GREY SUPPLIER
├── PROCESSOR
└── STITCHER

SALE ORDER
└── SALE ORDER ITEMS
    ↓
PRODUCTION ORDER
├── BOM
├── PROCESSING ORDER
└── STITCHING ORDER

GREY PURCHASE
└── PURCHASE LINES
    ↓
GREY LOT
├── ALLOCATION
├── PROCESSING ORDER LOT
└── INVENTORY MOVEMENTS

PROCESSING ORDER
├── PROCESSING ORDER LOT
├── PROCESSING RECEIPT
├── PROCESSING BILL
└── PROCESSOR SHORTAGE

STITCHING ORDER
├── MATERIAL ISSUE
├── PRODUCTION RECEIPT
├── MATERIAL SETTLEMENT
└── STITCHING BILL

BUSINESS TRANSACTION
├── INVENTORY MOVEMENT
└── JOURNAL ENTRY
28. End-to-End Workflow
Owner Investment
↓
Grey Purchase
↓
Grey Lot Creation
↓
Sale Order
↓
Production Order
↓
BOM and Grey Requirement
↓
Grey Allocation
↓
Issue to Processor
↓
Processing Receipt
↓
Shortage Reconciliation
↓
Processing Bill and Settlement
↓
Issue Processed Cloth to Stitcher
↓
Cutting and Stitching
↓
Production Receipt
↓
Finished Goods
↓
Sales
↓
Accounting and Profitability
29. Critical System Invariants
Inventory
Current Stock ≥ 0
Processor
Issued = Processed + Returned + Shortage
Stitcher
Issued = Consumed + Returned + Wastage + Shortage + WIP
Accounting
Total Debits = Total Credits
30. Transaction Workflow Safety
Critical posting uses one PostgreSQL transaction:
BEGIN;

-- Validate document
-- Validate stock
-- Create inventory movements
-- Calculate shortage or production settlement
-- Create production costs
-- Create journal entries
-- Validate debit = credit
-- Mark documents POSTED

COMMIT;
If any operation fails:
ROLLBACK;
No partially posted transaction may remain.
31. Recommended Indexes
CREATE INDEX idx_inventory_movement_item
ON inventory.inventory_movements(item_id);

CREATE INDEX idx_inventory_movement_lot
ON inventory.inventory_movements(lot_id);

CREATE INDEX idx_inventory_movement_po
ON inventory.inventory_movements(production_order_id);

CREATE INDEX idx_inventory_movement_so
ON inventory.inventory_movements(sale_order_id);

CREATE INDEX idx_processing_order_processor
ON production.processing_orders(processor_id);

CREATE INDEX idx_journal_lines_account
ON accounting.journal_lines(account_id);

CREATE INDEX idx_journal_lines_party
ON accounting.journal_lines(party_id);
32. Security Roles
ADMIN
ACCOUNTANT
INVENTORY_MANAGER
PRODUCTION_MANAGER
SALES_USER
VIEWER
33. Future Extensions
Customer Invoices
Sales Tax
Purchase Orders
Bank Reconciliation
Payroll
Fixed Assets
Multi-Warehouse
Barcode Scanning
QR Lot Tracking
Mobile Application
FBR / PRA Integration
34. Final Architecture
The system operates around three integrated ledgers:
Inventory Ledger
Tracks:
Material
Location
Lot
Quality
Sale Order
Production Order
Production Ledger
Tracks:
Production Orders
Material Consumption
Processor Quantities
Stitcher Quantities
WIP
Losses
Finished Production
General Ledger
Tracks:
Cash
Payables
Receivables
Inventory
Production Costs
Income
Expenses
Profitability
35. Final Development Rule
NO INVENTORY CHANGE
WITHOUT
AN INVENTORY LEDGER ENTRY
NO FINANCIAL POSTING
WITHOUT
A BALANCED JOURNAL ENTRY
NO PROCESSOR OR STITCHER ORDER
CAN CLOSE
WITHOUT
FULL MATERIAL RECONCILIATION
36. Implementation Priority
Phase 1 — Foundation
PostgreSQL, Users, Parties, Items, Categories, Qualities, Designs, Locations and Chart of Accounts.
Phase 2 — Inventory
Grey Purchases, Grey Lots, Inventory Ledger and Stock Calculation.
Phase 3 — Sales and Production
Sale Orders, Production Orders, BOM and Grey Allocation.
Phase 4 — Processing
Processing Orders, Grey Issue, Processor Stock, Receipts, Shortages, Recoveries and Processing Bills.
Phase 5 — Stitching
Stitching Orders, Material Issue, Production Receipts, Settlements, Stitching Bills and Finished Goods.
Phase 6 — Accounting
Automatic Journal Engine, Party Ledgers, Production Costing, Trial Balance and Profitability Reports.
Final Result
The U.K Arts ERP provides end-to-end traceability:
OWNER INVESTMENT
↓
GREY PURCHASE
↓
GREY LOT
↓
SALE ORDER
↓
PRODUCTION ORDER
↓
PROCESSOR
↓
PROCESSED CLOTH
↓
STITCHER
↓
FINISHED GOODS
↓
SALE
↓
ACCOUNTING
↓
PROFITABILITY
Grey control is maintained at every stage:
Owner
Processor
Processed Stock
Stitcher
Finished Goods
Every material movement remains traceable:
Lot-wise
Quality-wise
Category-wise
Sale Order-wise
Production Order-wise
Party-wise
Location-wise# ukarts