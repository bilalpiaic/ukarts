-- U.K Arts ERP - production reference data. Idempotent (safe to re-run).
-- Seeds only what the system needs to start: the bootstrap admin, organization,
-- chart of accounts, posting rules, units, and warehouse locations.
-- Sample parties, items, designs, and the demo "user" account are not inserted.

-- Bootstrap administrator. The initial password is admin123 on first insert only;
-- later password changes in Settings are preserved (ON CONFLICT DO NOTHING).
INSERT INTO master.users (username, full_name, email, password_hash, role)
VALUES ('admin', 'System Administrator', 'admin@ukarts.local', crypt('admin123', gen_salt('bf')), 'ADMIN')
ON CONFLICT (username) DO NOTHING;

-- Upgrade any legacy placeholder hash to a real bcrypt hash.
UPDATE master.users SET password_hash = crypt('admin123', gen_salt('bf'))
WHERE username = 'admin' AND password_hash = 'x';

-- Organization defaults (used in print headers and settings)
INSERT INTO master.organization (name, address, phone, email, tax_id, currency)
SELECT 'U.K Arts', 'Faisalabad, Pakistan', '+92-41-0000000', 'info@ukarts.local', 'NTN-0000000', 'PKR'
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
-- Remove unused sample/demo master data from earlier seeds (safe: skips rows
-- that are already referenced by live transactions).
-- ---------------------------------------------------------------------------

-- Re-home postings from the demo operator, then drop that account.
UPDATE accounting.journal_entries
SET posted_by = (SELECT id FROM master.users WHERE username = 'admin')
WHERE posted_by IN (SELECT id FROM master.users WHERE username = 'user' AND email = 'user@ukarts.local');

UPDATE inventory.inventory_transactions
SET posted_by = (SELECT id FROM master.users WHERE username = 'admin')
WHERE posted_by IN (SELECT id FROM master.users WHERE username = 'user' AND email = 'user@ukarts.local');

UPDATE audit.audit_logs
SET user_id = (SELECT id FROM master.users WHERE username = 'admin')
WHERE user_id IN (SELECT id FROM master.users WHERE username = 'user' AND email = 'user@ukarts.local');

DELETE FROM master.users
WHERE username = 'user' AND email = 'user@ukarts.local';

-- Unlink sample processor/stitcher parties from system locations.
UPDATE inventory.locations
SET party_id = NULL
WHERE location_code IN ('BG_PROCESSOR', 'STITCHER')
  AND party_id IN (
    SELECT id FROM master.parties
    WHERE party_code IN ('SUP-001', 'CUST-001', 'PROC-001', 'STIT-001')
  );

DELETE FROM master.party_roles
WHERE party_id IN (
  SELECT p.id FROM master.parties p
  WHERE p.party_code IN ('SUP-001', 'CUST-001', 'PROC-001', 'STIT-001')
    AND NOT EXISTS (SELECT 1 FROM inventory.grey_purchases g WHERE g.supplier_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM sales.sale_orders s WHERE s.buyer_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM production.processing_orders o WHERE o.processor_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM production.processing_bills b WHERE b.processor_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM production.stitching_orders o WHERE o.stitcher_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM production.stitching_bills b WHERE b.stitcher_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM accounting.journal_lines jl WHERE jl.party_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM inventory.locations l WHERE l.party_id = p.id)
);

DELETE FROM master.parties p
WHERE p.party_code IN ('SUP-001', 'CUST-001', 'PROC-001', 'STIT-001')
  AND NOT EXISTS (SELECT 1 FROM master.party_roles r WHERE r.party_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM inventory.grey_purchases g WHERE g.supplier_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM sales.sale_orders s WHERE s.buyer_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM production.processing_orders o WHERE o.processor_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM production.processing_bills b WHERE b.processor_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM production.stitching_orders o WHERE o.stitcher_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM production.stitching_bills b WHERE b.stitcher_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM accounting.journal_lines jl WHERE jl.party_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM inventory.locations l WHERE l.party_id = p.id);

DELETE FROM master.designs d
WHERE d.design_code = 'DZ-2PC'
  AND NOT EXISTS (SELECT 1 FROM sales.sale_order_items i WHERE i.design_id = d.id)
  AND NOT EXISTS (SELECT 1 FROM production.production_orders o WHERE o.design_id = d.id)
  AND NOT EXISTS (SELECT 1 FROM production.stitching_orders o WHERE o.design_id = d.id)
  AND NOT EXISTS (SELECT 1 FROM production.finished_goods_receipts r WHERE r.design_id = d.id);

DELETE FROM master.items i
WHERE i.item_code IN ('GREY-LAWN-A', 'PROC-LAWN-A', 'FG-2PC-SUIT')
  AND NOT EXISTS (SELECT 1 FROM inventory.grey_purchase_lines l WHERE l.item_id = i.id)
  AND NOT EXISTS (SELECT 1 FROM inventory.grey_lots l WHERE l.item_id = i.id)
  AND NOT EXISTS (SELECT 1 FROM inventory.inventory_movements m WHERE m.item_id = i.id)
  AND NOT EXISTS (SELECT 1 FROM sales.sale_order_items s WHERE s.item_id = i.id)
  AND NOT EXISTS (SELECT 1 FROM production.production_bom b WHERE b.item_id = i.id)
  AND NOT EXISTS (SELECT 1 FROM production.processing_receipt_lines r WHERE r.processed_item_id = i.id)
  AND NOT EXISTS (SELECT 1 FROM production.stitching_material_issues s WHERE s.item_id = i.id)
  AND NOT EXISTS (SELECT 1 FROM production.finished_goods_receipts r WHERE r.item_id = i.id);

DELETE FROM master.qualities q
WHERE q.quality_code = 'LAWN-A'
  AND NOT EXISTS (SELECT 1 FROM master.items i WHERE i.quality_id = q.id);

DELETE FROM master.categories c
WHERE c.category_code = 'LAWN'
  AND NOT EXISTS (SELECT 1 FROM master.qualities q WHERE q.category_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM master.items i WHERE i.category_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM master.designs d WHERE d.category_id = c.id);
