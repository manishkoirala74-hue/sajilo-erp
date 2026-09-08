SELECT
  l.account_id,
  SUM(l.debit_amount - l.credit_amount) as net_debit
FROM "GeneralLedgerLine" l
JOIN "GeneralLedgerJournal" j ON l.journal_id::uuid = j.id
WHERE j.status = 'Posted'
  AND j.reference_module NOT IN ('YearEndClose', 'OpeningBalance')
  AND l.company_id::uuid = 'a10e6e72-13ca-46f0-82ba-5cd421da6e2d'::uuid
  AND j.company_id::uuid = 'a10e6e72-13ca-46f0-82ba-5cd421da6e2d'::uuid
  AND j.entry_date::DATE >= '2025-07-17'::DATE
  AND j.entry_date::DATE <= '2026-07-16'::DATE
GROUP BY l.account_id;
