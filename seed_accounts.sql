-- Insert top-level group ledgers
INSERT INTO "ChartOfAccount" (account_code, account_name, account_type, ledger_type, normal_balance, is_system_account)
VALUES 
('1000', 'Assets', 'Asset', 'Group Ledger', 'Debit', true),
('2000', 'Liabilities', 'Liability', 'Group Ledger', 'Credit', true),
('3000', 'Equity', 'Equity', 'Group Ledger', 'Credit', true),
('4000', 'Revenue', 'Revenue', 'Group Ledger', 'Credit', true),
('5000', 'COGS', 'COGS', 'Group Ledger', 'Debit', true),
('6000', 'OPEX', 'OPEX', 'Group Ledger', 'Debit', true)
ON CONFLICT DO NOTHING;

-- Insert first-level sub-groups using parent_account_id mapped by account_code
INSERT INTO "ChartOfAccount" (account_code, account_name, account_type, ledger_type, normal_balance, is_system_account, parent_account_id)
SELECT '1100', 'Current Assets', 'Asset', 'Group Ledger', 'Debit', true, id FROM "ChartOfAccount" WHERE account_code = '1000'
UNION ALL
SELECT '1200', 'Fixed Assets', 'Asset', 'Group Ledger', 'Debit', true, id FROM "ChartOfAccount" WHERE account_code = '1000'
UNION ALL
SELECT '2100', 'Current Liability', 'Liability', 'Group Ledger', 'Credit', true, id FROM "ChartOfAccount" WHERE account_code = '2000';

-- Insert second-level sub-groups
INSERT INTO "ChartOfAccount" (account_code, account_name, account_type, ledger_type, normal_balance, is_system_account, parent_account_id)
SELECT '1130', 'Inventory', 'Asset', 'Group Ledger', 'Debit', true, id FROM "ChartOfAccount" WHERE account_code = '1100';

-- Insert Sub Ledgers
INSERT INTO "ChartOfAccount" (account_code, account_name, account_type, ledger_type, normal_balance, is_system_account, parent_account_id)
SELECT '1201', 'Land', 'Asset', 'Sub Ledger', 'Debit', true, id FROM "ChartOfAccount" WHERE account_code = '1200'
UNION ALL
SELECT '1202', 'Buildings & Facilities', 'Asset', 'Sub Ledger', 'Debit', true, id FROM "ChartOfAccount" WHERE account_code = '1200'
UNION ALL
SELECT '1203', 'Machinery & Equipment', 'Asset', 'Sub Ledger', 'Debit', true, id FROM "ChartOfAccount" WHERE account_code = '1200'
UNION ALL
SELECT '1204', 'Vehicles', 'Asset', 'Sub Ledger', 'Debit', true, id FROM "ChartOfAccount" WHERE account_code = '1200'
UNION ALL
SELECT '1205', 'Office Furniture & Fixtures', 'Asset', 'Sub Ledger', 'Debit', true, id FROM "ChartOfAccount" WHERE account_code = '1200'
UNION ALL
SELECT '1206', 'Computer Equipment & Hardware', 'Asset', 'Sub Ledger', 'Debit', true, id FROM "ChartOfAccount" WHERE account_code = '1200'
UNION ALL
SELECT '1131', 'Raw Materials', 'Asset', 'Sub Ledger', 'Debit', true, id FROM "ChartOfAccount" WHERE account_code = '1130'
UNION ALL
SELECT '1132', 'Finished Goods', 'Asset', 'Sub Ledger', 'Debit', true, id FROM "ChartOfAccount" WHERE account_code = '1130'
UNION ALL
SELECT '1133', 'Semi-Finished Goods', 'Asset', 'Sub Ledger', 'Debit', true, id FROM "ChartOfAccount" WHERE account_code = '1130'
UNION ALL
SELECT '2199', 'Difference in Opening Balance', 'Liability', 'Sub Ledger', 'Credit', true, id FROM "ChartOfAccount" WHERE account_code = '2100'
UNION ALL
SELECT '4100', 'Sales Revenue', 'Revenue', 'Sub Ledger', 'Credit', true, id FROM "ChartOfAccount" WHERE account_code = '4000'
UNION ALL
SELECT '5100', 'Cost of Sales', 'COGS', 'Sub Ledger', 'Debit', true, id FROM "ChartOfAccount" WHERE account_code = '5000';
