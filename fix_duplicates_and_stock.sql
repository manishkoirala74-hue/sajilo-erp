DO $$
BEGIN
    -- 1. Fix GL Journals: For Purchase Invoices with multiple journals, keep the latest one, cancel the rest
    UPDATE "GeneralLedgerJournal"
    SET status = 'Cancelled'
    WHERE description NOT LIKE '%CANCELLED%'
      AND description NOT LIKE '%VOIDED%'
      AND source_document_type = 'PurchaseInvoice'
      AND source_document_id IS NOT NULL
      AND id NOT IN (
          SELECT id FROM (
              SELECT id, ROW_NUMBER() OVER(PARTITION BY source_document_id ORDER BY created_at DESC) as rn
              FROM "GeneralLedgerJournal"
              WHERE source_document_type = 'PurchaseInvoice'
                AND description NOT LIKE '%CANCELLED%' AND description NOT LIKE '%VOIDED%'
          ) sub WHERE rn = 1
      );

    -- 2. Recalculate Chart Of Account Balances
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

    -- 3. Recalculate all item quantities from scratch!
    UPDATE "Item" SET quantity_on_hand = 0;
    
    UPDATE "Item" i
    SET quantity_on_hand = calc.net_qty
    FROM (
        SELECT item_id, SUM(qty_change) as net_qty
        FROM (
            -- Purchase Invoices (Positive Qty)
            SELECT (el->>'item_id')::UUID as item_id, 
                   (el->>'quantity')::NUMERIC as qty_change
            FROM "PurchaseInvoice" pi, jsonb_array_elements(pi.line_items) el
            WHERE pi.status = 'Posted'
            
            UNION ALL
            
            -- Sales Invoices (Negative Qty)
            SELECT (el->>'item_id')::UUID as item_id, 
                   -(el->>'quantity')::NUMERIC as qty_change
            FROM "SalesInvoice" si, jsonb_array_elements(si.line_items) el
            WHERE si.status = 'Posted'
            
            UNION ALL
            
            -- POS Sales (Negative Qty)
            SELECT (el->>'item_id')::UUID as item_id, 
                   -(el->>'quantity')::NUMERIC as qty_change
            FROM "POSSale" ps, jsonb_array_elements(ps.line_items) el
            WHERE ps.status = 'Completed'
            
            UNION ALL

            -- Purchase Returns (Negative Qty)
            SELECT (el->>'item_id')::UUID as item_id, 
                   -(el->>'quantity')::NUMERIC as qty_change
            FROM "PurchaseReturn" pr, jsonb_array_elements(pr.line_items) el
            WHERE pr.status = 'Posted'

            UNION ALL

            -- Sales Returns (Positive Qty)
            SELECT (el->>'item_id')::UUID as item_id, 
                   (el->>'quantity')::NUMERIC as qty_change
            FROM "SalesReturn" sr, jsonb_array_elements(sr.line_items) el
            WHERE sr.status = 'Posted'
            
            UNION ALL
            
            -- Stock Adjustments (Based on difference)
            SELECT (el->>'item_id')::UUID as item_id, 
                   ((el->>'actual_quantity')::NUMERIC - (el->>'system_quantity')::NUMERIC) as qty_change
            FROM "StockAdjustment" sa, jsonb_array_elements(sa.line_items) el
            WHERE sa.status = 'Posted'

        ) all_txns
        WHERE item_id IS NOT NULL
        GROUP BY item_id
    ) calc
    WHERE i.id = calc.item_id;

END $$;
