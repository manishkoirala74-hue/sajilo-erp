SELECT * FROM get_stabilized_general_ledger_statement_rpc(
  (SELECT id FROM "Company" LIMIT 1),
  (SELECT id FROM "ChartOfAccount" WHERE account_name ILIKE '%inventory%' LIMIT 1),
  '2026-01-01',
  '2026-12-31'
);
