-- 035_enforce_limit_10_rpc.sql
-- Enforces a strict server-side ceiling (LIMIT 10) on historical trading and ledger arrays.

DROP FUNCTION IF EXISTS get_item_recent_trading_history_rpc(TEXT, INT);

CREATE OR REPLACE FUNCTION get_item_recent_trading_history_rpc(p_item_id TEXT)
RETURNS TABLE (
    transaction_type TEXT,
    invoice_number TEXT,
    invoice_date TIMESTAMP WITH TIME ZONE,
    quantity NUMERIC,
    unit_price NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    (
        -- Sales History
        SELECT 
            'Sale'::TEXT AS transaction_type,
            sil.invoice_number,
            sil.invoice_date,
            sil.quantity,
            sil.unit_price
        FROM "SalesInvoiceLine" sil
        WHERE sil.item_id = p_item_id
        ORDER BY sil.invoice_date DESC
        LIMIT 10
    )
    UNION ALL
    (
        -- Purchase History
        SELECT 
            'Purchase'::TEXT AS transaction_type,
            pil.invoice_number,
            pil.invoice_date,
            pil.quantity,
            pil.unit_price
        FROM "PurchaseInvoiceLine" pil
        WHERE pil.item_id = p_item_id
        ORDER BY pil.invoice_date DESC
        LIMIT 10
    )
    ORDER BY invoice_date DESC
    LIMIT 10;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION get_item_recent_trading_history_rpc TO authenticated;
GRANT EXECUTE ON FUNCTION get_item_recent_trading_history_rpc TO service_role;


DROP FUNCTION IF EXISTS get_partner_ledger_history_rpc(TEXT, INT);

CREATE OR REPLACE FUNCTION get_partner_ledger_history_rpc(
    p_entity_id TEXT
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
    LIMIT 10;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION get_partner_ledger_history_rpc TO authenticated;
GRANT EXECUTE ON FUNCTION get_partner_ledger_history_rpc TO service_role;
