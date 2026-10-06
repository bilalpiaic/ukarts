-- U.K Arts ERP - production reference data. Idempotent (safe to re-run).
-- Seeds only system setup: bootstrap admin, organization name, chart of
-- accounts, posting rules, units, and warehouse locations.
--
-- The file opens with a one-time fresh start: bump FRESH START TOKEN below to
-- hand over an empty database on the next deploy. The wipe runs once per token
-- and is skipped afterwards, so routine releases never clear live postings.
-- Admins can also reset on demand from Settings -> Fresh start.

-- ---------------------------------------------------------------------------
-- One-time fresh start (runs before the inserts below, so any reference data
-- it touches is immediately restored).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  -- FRESH START TOKEN: change this value to schedule one more wipe on deploy.
  token TEXT := '2026-10-06-clear-testing-entries';
  cleared JSONB;
BEGIN
  IF EXISTS (
    SELECT 1 FROM master.app_meta WHERE key = 'fresh_start' AND value = token
  ) THEN
    RETURN;
  END IF;

  cleared := master.fresh_start();
  RAISE NOTICE 'Fresh start % applied: %', token, cleared;

  INSERT INTO master.app_meta (key, value)
  VALUES ('fresh_start', token)
  ON CONFLICT (key) DO UPDATE SET value = token, updated_at = NOW();
END $$;

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

-- System locations for every stage of the grey lifecycle (no sample parties).
INSERT INTO inventory.locations (location_code, location_name, location_type, party_id)
VALUES
    ('OWNER_GREY',      'Owner Grey Store',      'OWNER_GREY',      NULL),
    ('PROCESSED_STORE', 'Processed Cloth Store', 'PROCESSED_STORE', NULL),
    ('FINISHED_GOODS',  'Finished Goods Store',  'FINISHED_GOODS',  NULL),
    ('BG_PROCESSOR',    'Processor Floor',       'PROCESSOR',       NULL),
    ('STITCHER',        'Stitcher Floor',        'STITCHER',        NULL)
ON CONFLICT (location_code) DO NOTHING;
