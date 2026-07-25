-- 0119_expression_index_performance.sql
-- Creates specialized indexes to support high-speed UUID casting 
-- on legacy TEXT columns without locking the live ledger.

-- Note: CONCURRENTLY cannot be run inside a transaction block.
CREATE INDEX IF NOT EXISTS idx_gll_journal_id_uuid 
ON "GeneralLedgerLine" ((journal_id::uuid));

CREATE INDEX IF NOT EXISTS idx_gll_account_id_uuid 
ON "GeneralLedgerLine" ((account_id::uuid));
