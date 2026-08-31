-- U.K Arts ERP - seed / reference data. Idempotent (safe to re-run).

-- Default admin user (password_hash is a placeholder; auth is out of scope for this slice)
INSERT INTO master.users (username, full_name, email, password_hash, role)
VALUES ('admin', 'System Administrator', 'admin@ukarts.local', 'x', 'ADMIN')
ON CONFLICT (username) DO NOTHING;

-- Chart of accounts (codes referenced by the automatic posting rules in the SDD)
INSERT INTO accounting.accounts (account_code, account_name, account_type) VALUES
    ('1000', 'Cash / Bank',            'ASSET'),
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

-- Grey supplier party
INSERT INTO master.parties (party_code, party_name, phone) VALUES
    ('SUP-001', 'Al-Karam Grey Mills', '+92-300-0000001')
ON CONFLICT (party_code) DO NOTHING;

INSERT INTO master.party_roles (party_id, role)
SELECT p.id, 'GREY_SUPPLIER' FROM master.parties p WHERE p.party_code = 'SUP-001'
ON CONFLICT (party_id, role) DO NOTHING;

-- Owner grey store location
INSERT INTO inventory.locations (location_code, location_name, location_type) VALUES
    ('OWNER_GREY', 'Owner Grey Store', 'OWNER_GREY')
ON CONFLICT (location_code) DO NOTHING;
