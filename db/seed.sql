-- U.K Arts ERP - production reference data. Idempotent (safe to re-run).
-- Seeds only system setup: bootstrap admin, organization name, chart of
-- accounts, posting rules, units, and warehouse locations.
-- A versioned fresh-start wipe clears leftover demo/test operational data
-- (parties, items, designs, journals, inventory, production, sales) while
-- keeping the chart of accounts, users, and organization settings. It runs
-- once per generation; bump the generation below to wipe again on deploy.

-- Bootstrap administrator. The initial password is admin123 on first insert only;
-- later password changes in Settings are preserved (ON CONFLICT DO NOTHING).
INSERT INTO master.users (username, full_name, email, password_hash, role)
VALUES ('admin', 'System Administrator', 'admin@ukarts.local', crypt('admin123', gen_salt('bf')), 'ADMIN')
ON CONFLICT (username) DO NOTHING;

-- Upgrade any legacy placeholder hash to a real bcrypt hash.
UPDATE master.users SET password_hash = crypt('admin123', gen_salt('bf'))
WHERE username = 'admin' AND password_hash = 'x';

-- Organization defaults (used in print headers and settings)
INSERT INTO master.organization (name, currency, about)
SELECT 'U.K Arts', 'PKR',
       'U.K Arts is a textile and garment house devoted to the craft of cloth — from grey purchase through processing and stitching to finished fashion. Every lot is handled with passion for quality, cut, and colour.'
WHERE NOT EXISTS (SELECT 1 FROM master.organization);

UPDATE master.organization
SET about = 'U.K Arts is a textile and garment house devoted to the craft of cloth — from grey purchase through processing and stitching to finished fashion. Every lot is handled with passion for quality, cut, and colour.'
WHERE about IS NULL;

-- Chart of accounts (codes referenced by the automatic posting rules in the SDD)
INSERT INTO accounting.accounts (account_code, account_name, account_type) VALUES
    ('1000', 'Cash / Bank',            'ASSET'),
    ('1100', 'Accounts Receivable',    'ASSET'),
    ('1200', 'Grey Inventory',         'ASSET'),
    ('1300', 'Processed Cloth',        'ASSET'),
    ('1400', 'Finished Goods',         'ASSET'),
    ('2000', 'Supplier Payable',       'LIABILITY'),
    ('2100', 'Processor Payable',      'LIABILITY'),
    ('2200', 'Stitcher Payable',       'LIABILITY'),
    ('3000', 'Owner Investment',       'EQUITY'),
    ('4000', 'Sales Income',           'INCOME'),
    ('5000', 'Grey Consumption',       'EXPENSE'),
    ('5100', 'Processing / Production Cost', 'EXPENSE'),
    ('5200', 'Normal Loss',            'EXPENSE'),
    ('5300', 'Abnormal Loss',          'EXPENSE'),
    ('5400', 'Stitching Cost',         'EXPENSE')
ON CONFLICT (account_code) DO NOTHING;

-- Automatic journal rules (SDD section 20)
INSERT INTO accounting.posting_rules (transaction_type, debit_account_code, credit_account_code, description) VALUES
    ('OWNER_INVESTMENT',            '1000', '3000', 'Dr Cash/Bank, Cr Owner Investment'),
    ('GREY_PURCHASE',              '1200', '2000', 'Dr Grey Inventory, Cr Supplier Payable'),
    ('PROCESSING_BILL',           '5100', '2100', 'Dr Processing/Production Cost, Cr Processor Payable'),
    ('PROCESSOR_RECOVERABLE_SHORTAGE', '2100', '5000', 'Dr Processor Account, Cr Grey Consumption'),
    ('NORMAL_PROCESS_LOSS',       '5200', '1200', 'Dr Normal Loss, Cr Grey Inventory'),
    ('ABNORMAL_LOSS',             '5300', '1200', 'Dr Abnormal Loss, Cr Grey Inventory'),
    ('STITCHING_BILL',            '5100', '2200', 'Dr Production/Finished Goods Cost, Cr Stitcher Payable')
ON CONFLICT (transaction_type, debit_account_code, credit_account_code) DO NOTHING;

-- Control accounts: GL total = sum of party sub-ledgers for that role.
INSERT INTO accounting.control_ledgers (account_id, party_role, caption, normal_side)
SELECT id, 'CUSTOMER', 'Customers', 'DEBIT'
FROM accounting.accounts WHERE account_code = '1100'
ON CONFLICT (party_role) DO NOTHING;
INSERT INTO accounting.control_ledgers (account_id, party_role, caption, normal_side)
SELECT id, 'GREY_SUPPLIER', 'Vendors', 'CREDIT'
FROM accounting.accounts WHERE account_code = '2000'
ON CONFLICT (party_role) DO NOTHING;
INSERT INTO accounting.control_ledgers (account_id, party_role, caption, normal_side)
SELECT id, 'PROCESSOR', 'Processors', 'CREDIT'
FROM accounting.accounts WHERE account_code = '2100'
ON CONFLICT (party_role) DO NOTHING;
INSERT INTO accounting.control_ledgers (account_id, party_role, caption, normal_side)
SELECT id, 'STITCHER', 'Stitchers', 'CREDIT'
FROM accounting.accounts WHERE account_code = '2200'
ON CONFLICT (party_role) DO NOTHING;

-- Units
INSERT INTO master.units (unit_code, unit_name, decimal_precision) VALUES
    ('MTR', 'Meter', 4),
    ('PCS', 'Pieces', 0)
ON CONFLICT (unit_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Fresh start: empty operational ledgers and business master data. Keeps the
-- chart of accounts, posting rules, control ledgers, units, system locations,
-- login users, and organization settings.
--
-- The wipe runs once per generation. master.app_meta('fresh_start') records
-- the generation that was last applied ('done' is the legacy first generation).
-- To wipe test data again before go-live, increase fresh_start_generation; the
-- next db:setup / Vercel deploy clears the data once and later runs skip it,
-- so live client postings are never wiped by routine deploys.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  fresh_start_generation CONSTANT TEXT := '2';
  applied_generation TEXT;
BEGIN
  SELECT value INTO applied_generation
  FROM master.app_meta WHERE key = 'fresh_start';

  IF applied_generation = fresh_start_generation THEN
    RETURN;
  END IF;

  RAISE NOTICE 'Fresh start generation %: clearing operational and business master data (COA, users, organization kept).',
    fresh_start_generation;

  -- Every table that references a wiped table must be listed here (no CASCADE)
  -- so a kept table can never be emptied silently. inventory.locations
  -- references parties; the system locations are re-inserted right below.
  TRUNCATE TABLE
    inventory.locations,
    master.document_files,
    audit.audit_logs,
    production.production_costs,
    production.stitcher_material_settlements,
    production.stitching_bill_lines,
    production.stitching_bills,
    production.stitching_production_receipts,
    production.stitching_material_issues,
    production.stitching_orders,
    production.finished_goods_receipts,
    production.processor_shortages,
    production.processing_bill_lines,
    production.processing_bills,
    production.processing_receipt_lines,
    production.processing_receipts,
    production.processing_order_lots,
    production.processing_orders,
    production.production_bom,
    production.production_orders,
    inventory.grey_allocations,
    inventory.inventory_movements,
    inventory.inventory_transactions,
    inventory.grey_lots,
    inventory.grey_purchase_lines,
    inventory.grey_purchases,
    sales.sale_order_items,
    sales.sale_orders,
    accounting.journal_lines,
    accounting.journal_entries,
    master.party_roles,
    master.parties,
    master.items,
    master.designs,
    master.qualities,
    master.categories
  RESTART IDENTITY;

  -- Legacy placeholder organization details from the original demo seed.
  UPDATE master.organization
  SET
    address = CASE WHEN address = 'Faisalabad, Pakistan' THEN NULL ELSE address END,
    phone = CASE WHEN phone = '+92-41-0000000' THEN NULL ELSE phone END,
    email = CASE WHEN email = 'info@ukarts.local' THEN NULL ELSE email END,
    tax_id = CASE WHEN tax_id = 'NTN-0000000' THEN NULL ELSE tax_id END,
    updated_at = NOW()
  WHERE address = 'Faisalabad, Pakistan'
     OR phone = '+92-41-0000000'
     OR email = 'info@ukarts.local'
     OR tax_id = 'NTN-0000000';

  INSERT INTO master.app_meta (key, value)
  VALUES ('fresh_start', fresh_start_generation)
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = NOW();
END $$;

-- System locations for every stage of the grey lifecycle (no sample parties).
INSERT INTO inventory.locations (location_code, location_name, location_type, party_id)
VALUES
    ('OWNER_GREY',      'Owner Grey Store',      'OWNER_GREY',      NULL),
    ('PROCESSED_STORE', 'Processed Cloth Store', 'PROCESSED_STORE', NULL),
    ('FINISHED_GOODS',  'Finished Goods Store',  'FINISHED_GOODS',  NULL),
    ('BG_PROCESSOR',    'Processor Floor',       'PROCESSOR',       NULL),
    ('STITCHER',        'Stitcher Floor',        'STITCHER',        NULL)
ON CONFLICT (location_code) DO NOTHING;
