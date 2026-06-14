-- 031_partner_ledger_history_rpc.sql
-- Create an RPC to fetch partner transaction history instantly from the Ledger.
-- This uses the entity_id stored on the GeneralLedgerLine (added in 003_schema_update.sql)

-- 1. Ensure a covered/composite index exists for rapid entity-based ledger lookups
CREATE INDEX IF NOT EXISTS "idx_glline_entity_id" ON "GeneralLedgerLine" ("entity_id", "journal_id");

-- 2. Create the RPC Function
CREATE OR REPLACE FUNCTION get_partner_ledger_history_rpc(
    p_entity_id UUID,
    p_limit INT DEFAULT 50
)
RETURNS TABLE (
    journal_id TEXT,
    entry_date TIMESTAMPTZ,
    source_document_type TEXT,
    reference_module TEXT,
    description TEXT,
    debit_amount NUMERIC,
    credit_amount NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        j.id::TEXT as journal_id,
        j.entry_date,
        j.source_document_type,
        j.reference_module,
        j.description,
        l.debit_amount,
        l.credit_amount
    FROM "GeneralLedgerLine" l
    JOIN "GeneralLedgerJournal" j ON l.journal_id = j.id::TEXT
    WHERE l.entity_id = p_entity_id
      AND j.status = 'Posted'
    ORDER BY j.entry_date DESC, j.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_partner_ledger_history_rpc TO authenticated;
GRANT EXECUTE ON FUNCTION get_partner_ledger_history_rpc TO service_role;
