-- 032_fix_ledger_rpc_types.sql
-- Fixes type mismatch error 'operator does not exist: text = uuid'

DROP FUNCTION IF EXISTS get_partner_ledger_history_rpc(UUID, INT);

CREATE OR REPLACE FUNCTION get_partner_ledger_history_rpc(
    p_entity_id TEXT,
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
    JOIN "GeneralLedgerJournal" j ON l.journal_id::TEXT = j.id::TEXT
    WHERE l.entity_id::TEXT = p_entity_id::TEXT
      AND j.status = 'Posted'
    ORDER BY j.entry_date DESC, j.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION get_partner_ledger_history_rpc TO authenticated;
GRANT EXECUTE ON FUNCTION get_partner_ledger_history_rpc TO service_role;
