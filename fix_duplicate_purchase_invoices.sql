DO $$
DECLARE
    dup RECORD;
    extra_count INT;
    inv RECORD;
    line_item JSONB;
BEGIN
    -- 1. For each PurchaseInvoice, find if it has > 1 GL journal
    FOR dup IN (
        SELECT source_document_id, count(*) as c
        FROM "GeneralLedgerJournal"
        WHERE source_document_type = 'PurchaseInvoice'
          AND description NOT LIKE '%CANCELLED%'
          AND description NOT LIKE '%VOIDED%'
          AND status != 'Cancelled'
        GROUP BY source_document_id
        HAVING count(*) > 1
    ) LOOP
        extra_count := dup.c - 1;

        -- 2. Cancel the older duplicate journals (keep the most recent one)
        UPDATE "GeneralLedgerJournal"
        SET status = 'Cancelled'
        WHERE id IN (
            SELECT id FROM (
                SELECT id, ROW_NUMBER() OVER(ORDER BY created_at DESC) as rn
                FROM "GeneralLedgerJournal"
                WHERE source_document_type = 'PurchaseInvoice'
                  AND source_document_id = dup.source_document_id
                  AND description NOT LIKE '%CANCELLED%' 
                  AND description NOT LIKE '%VOIDED%'
                  AND status != 'Cancelled'
            ) sub WHERE rn > 1
        );

        -- 3. Reverse the extra item quantities added by the duplicates
        SELECT * INTO inv FROM "PurchaseInvoice" WHERE id::TEXT = dup.source_document_id::TEXT;
        IF inv.id IS NOT NULL THEN
            FOR line_item IN SELECT * FROM jsonb_array_elements(inv.line_items)
            LOOP
                UPDATE "Item"
                SET quantity_on_hand = GREATEST(0, quantity_on_hand - ( (line_item->>'quantity')::NUMERIC * extra_count ))
                WHERE id::TEXT = line_item->>'item_id';
            END LOOP;
        END IF;

    END LOOP;

    -- 4. Recalculate Chart Of Account Balances to fix the party ledger
    UPDATE "ChartOfAccount" SET current_balance = 0;

    UPDATE "ChartOfAccount" c
    SET current_balance = calc.net_balance
    FROM (
        SELECT 
            l.account_id::TEXT as account_id,
            SUM(
                CASE 
                    WHEN c_type.account_type IN ('Asset', 'COGS', 'Expense', 'OPEX', 'Cost of Goods Sold', 'Other Expense') 
                    THEN COALESCE(l.debit_amount, 0) - COALESCE(l.credit_amount, 0)
                    ELSE COALESCE(l.credit_amount, 0) - COALESCE(l.debit_amount, 0)
                END
            ) as net_balance
        FROM "GeneralLedgerLine" l
        JOIN "GeneralLedgerJournal" j ON j.id::TEXT = l.journal_id::TEXT
        JOIN "ChartOfAccount" c_type ON c_type.id::TEXT = l.account_id::TEXT
        WHERE j.status = 'Posted'
        GROUP BY l.account_id::TEXT
    ) calc
    WHERE c.id::TEXT = calc.account_id;

END $$;
