-- U.K Arts ERP - seed / reference data. Idempotent (safe to re-run).

-- Users with real bcrypt password hashes (pgcrypto). Default credentials:
--   admin / admin123  (role ADMIN — full edit/delete)
--   user  / user123   (role USER  — create/view)
INSERT INTO master.users (username, full_name, email, password_hash, role)
VALUES ('admin', 'System Administrator', 'admin@ukarts.local', crypt('admin123', gen_salt('bf')), 'ADMIN')
ON CONFLICT (username) DO NOTHING;

INSERT INTO master.users (username, full_name, email, password_hash, role)
VALUES ('user', 'Standard User', 'user@ukarts.local', crypt('user123', gen_salt('bf')), 'USER')
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

-- Category / quality
INSERT INTO master.categories (category_code, category_name) VALUES
    ('LAWN', 'Lawn Fabric')
ON CONFLICT (category_code) DO NOTHING;

INSERT INTO master.qualities (quality_code, quality_name, category_id)
SELECT 'LAWN-A', 'Lawn Grade A', c.id FROM master.categories c WHERE c.category_code = 'LAWN'
ON CONFLICT (quality_code) DO NOTHING;

-- Grey cloth item
INSERT INTO master.items (item_code, item_name, item_type, category_id, quality_id, unit_id)
SELECT 'GREY-LAWN-A', 'Grey Lawn Grade A', 'GREY_CLOTH', c.id, q.id, u.id
FROM master.categories c
JOIN master.qualities q ON q.quality_code = 'LAWN-A'
JOIN master.units u ON u.unit_code = 'MTR'
WHERE c.category_code = 'LAWN'
ON CONFLICT (item_code) DO NOTHING;

-- Processed cloth item (output of processing)
INSERT INTO master.items (item_code, item_name, item_type, category_id, quality_id, unit_id)
SELECT 'PROC-LAWN-A', 'Processed Lawn Grade A', 'PROCESSED_CLOTH', c.id, q.id, u.id
FROM master.categories c
JOIN master.qualities q ON q.quality_code = 'LAWN-A'
JOIN master.units u ON u.unit_code = 'MTR'
WHERE c.category_code = 'LAWN'
ON CONFLICT (item_code) DO NOTHING;

-- Finished good item (output of stitching), measured in pieces
INSERT INTO master.items (item_code, item_name, item_type, unit_id)
SELECT 'FG-2PC-SUIT', 'Ladies 2PC Suit', 'FINISHED_GOOD', u.id
FROM master.units u WHERE u.unit_code = 'PCS'
ON CONFLICT (item_code) DO NOTHING;

-- Design (BOM basis): 1 suit consumes 5 meters of fabric
INSERT INTO master.designs (design_code, design_name, category_id, standard_consumption)
SELECT 'DZ-2PC', 'Ladies 2PC Suit', c.id, 5
FROM master.categories c WHERE c.category_code = 'LAWN'
ON CONFLICT (design_code) DO NOTHING;

-- Parties: supplier, customer, processor, stitcher
INSERT INTO master.parties (party_code, party_name, phone) VALUES
    ('SUP-001',  'Al-Karam Grey Mills',   '+92-300-0000001'),
    ('CUST-001', 'Ideas Retail',          '+92-300-0000002'),
    ('PROC-001', 'Master Dyeing & Processing', '+92-300-0000003'),
    ('STIT-001', 'Fine Stitching House',   '+92-300-0000004')
ON CONFLICT (party_code) DO NOTHING;

INSERT INTO master.party_roles (party_id, role)
SELECT p.id, r.role FROM master.parties p
JOIN (VALUES
    ('SUP-001',  'GREY_SUPPLIER'),
    ('CUST-001', 'CUSTOMER'),
    ('PROC-001', 'PROCESSOR'),
    ('STIT-001', 'STITCHER')
) AS r(party_code, role) ON r.party_code = p.party_code
ON CONFLICT (party_id, role) DO NOTHING;

-- Locations across every stage of the grey lifecycle
INSERT INTO inventory.locations (location_code, location_name, location_type, party_id)
SELECT v.location_code, v.location_name, v.location_type, p.id
FROM (VALUES
    ('OWNER_GREY',      'Owner Grey Store',     'OWNER_GREY',      NULL),
    ('PROCESSED_STORE', 'Processed Cloth Store','PROCESSED_STORE', NULL),
    ('FINISHED_GOODS',  'Finished Goods Store', 'FINISHED_GOODS',  NULL),
    ('BG_PROCESSOR',    'Processor Floor',      'PROCESSOR',       'PROC-001'),
    ('STITCHER',        'Stitcher Floor',       'STITCHER',        'STIT-001')
) AS v(location_code, location_name, location_type, party_code)
LEFT JOIN master.parties p ON p.party_code = v.party_code
ON CONFLICT (location_code) DO NOTHING;
