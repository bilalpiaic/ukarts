-- U.K Arts ERP - production reference data. Idempotent (safe to re-run).
-- Seeds only system setup: bootstrap admin, organization name, chart of
-- accounts, posting rules, units, and warehouse locations.
-- A one-time fresh-start wipe clears leftover demo/sample operational data
-- (parties, items, designs, journals, inventory, production, sales) while
-- keeping the standard chart of accounts. It does not run again after that.

-- Bootstrap administrator. The initial password is admin123 on first insert only;
-- later password changes in Settings are preserved (ON CONFLICT DO NOTHING).
INSERT INTO master.users (username, full_name, email, password_hash, role)
VALUES ('admin', 'System Administrator', 'admin@ukarts.local', crypt('admin123', gen_salt('bf')), 'ADMIN')
ON CONFLICT (username) DO NOTHING;

-- Upgrade any legacy placeholder hash to a real bcrypt hash.
UPDATE master.users SET password_hash = crypt('admin123', gen_salt('bf'))
WHERE username = 'admin' AND password_hash = 'x';

-- Organization defaults (used in print headers and settings)
INSERT INTO master.organization (name, currency)
SELECT 'U.K Arts', 'PKR'
WHERE NOT EXISTS (SELECT 1 FROM master.organization);

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

-- Units
INSERT INTO master.units (unit_code, unit_name, decimal_precision) VALUES
    ('MTR', 'Meter', 4),
    ('PCS', 'Pieces', 0)
ON CONFLICT (unit_code) DO NOTHING;

-- System locations for every stage of the grey lifecycle (no sample parties).
INSERT INTO inventory.locations (location_code, location_name, location_type, party_id)
VALUES
    ('OWNER_GREY',      'Owner Grey Store',      'OWNER_GREY',      NULL),
    ('PROCESSED_STORE', 'Processed Cloth Store', 'PROCESSED_STORE', NULL),
    ('FINISHED_GOODS',  'Finished Goods Store',  'FINISHED_GOODS',  NULL),
    ('BG_PROCESSOR',    'Processor Floor',       'PROCESSOR',       NULL),
    ('STITCHER',        'Stitcher Floor',        'STITCHER',        NULL)
ON CONFLICT (location_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- One-time fresh start: empty operational ledgers. Keeps COA, posting rules,
-- units, system locations, and the bootstrap admin. Subsequent seed runs skip
-- this block so live client postings are not wiped on later deploys.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM master.app_meta WHERE key = 'fresh_start' AND value = 'done'
  ) THEN
    RETURN;
  END IF;

  RAISE NOTICE 'Fresh start: clearing operational and sample master data (COA kept).';

  UPDATE inventory.locations SET party_id = NULL WHERE party_id IS NOT NULL;

  TRUNCATE TABLE
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
  RESTART IDENTITY CASCADE;

  DELETE FROM master.users
  WHERE username <> 'admin';

  UPDATE master.organization
  SET
    address = CASE WHEN address = 'Faisalabad, Pakistan' THEN NULL ELSE address END,
    phone = CASE WHEN phone = '+92-41-0000000' THEN NULL ELSE phone END,
    email = CASE WHEN email = 'info@ukarts.local' THEN NULL ELSE email END,
    tax_id = CASE WHEN tax_id = 'NTN-0000000' THEN NULL ELSE tax_id END,
    updated_at = NOW();

  INSERT INTO master.app_meta (key, value)
  VALUES ('fresh_start', 'done')
  ON CONFLICT (key) DO UPDATE SET value = 'done', updated_at = NOW();
END $$;
