-- 111_execute_data_corrections.sql

DO $$
DECLARE
    v_company_id UUID := 'a10e6e72-13ca-46f0-82ba-5cd421da6e2d';
    v_missing_cogs_invoice_id UUID := '8defbaba-850f-4022-b25b-1b96f8ab80e6';
    -- Find the original manual journal that was reversed (which created the discrepancy).
    -- Based on the previous logs, the reversal was for Rs. 110,500.
    v_reversal_journal_id UUID;
    v_cogs_account_id UUID := 'abf82d7b-3bed-4cef-accc-c7c2ba91947b';
    v_inventory_account_id UUID := 'a900248e-a4b4-4c10-a452-eb014a12f0e6';
    
    v_exists BOOLEAN;
    v_new_journal_id UUID;
BEGIN
    -- Look up the exact reversed journal ID
    SELECT id INTO v_reversal_journal_id 
    FROM "GeneralLedgerJournal" 
    WHERE total_debit = 110500 AND status = 'Cancelled' 
    LIMIT 1;

    -- 1. Enable Maintenance Backdoor to bypass ChartOfAccount Trigger
    PERFORM set_config('sajilo.maintenance_mode', 'true', true);

    -- 2. Execute the COGS Metadata Fix
    UPDATE "ChartOfAccount"
    SET statement_group = 'Cost of Goods Sold',
        is_system_account = true
    WHERE id = v_cogs_account_id;

    UPDATE "ChartOfAccount"
    SET is_system_account = true
    WHERE id = v_inventory_account_id;

    -- 3. Check Idempotency Key for Missing COGS Entry
    SELECT EXISTS (
        SELECT 1 FROM "GeneralLedgerJournal"
        WHERE source_document_type = 'SystemReconciliation'
          AND source_document_id = v_missing_cogs_invoice_id
    ) INTO v_exists;

    IF NOT v_exists THEN
        -- Post the Rs. 45,000 reconciliation journal manually since it's highly specific
        INSERT INTO "GeneralLedgerJournal" (
            company_id, entry_date, description, reference_module, 
            source_document_id, source_document_type, status, total_debit, total_credit, is_balanced
        ) VALUES (
            v_company_id, '2026-07-05', 'Reconciliation Entry for SI-2026-005: Missing GL Lines', 'Accounting', 
            v_missing_cogs_invoice_id, 'SystemReconciliation', 'Posted', 45000, 45000, true
        ) RETURNING id INTO v_new_journal_id;

        INSERT INTO "GeneralLedgerLine" (
            company_id, journal_id, account_id, account_type,
            debit_amount, credit_amount, description
        ) VALUES (
            v_company_id, v_new_journal_id, v_cogs_account_id, 'Expense',
            45000, 0, 'Missing COGS for SI-2026-005'
        );

        INSERT INTO "GeneralLedgerLine" (
            company_id, journal_id, account_id, account_type,
            debit_amount, credit_amount, description
        ) VALUES (
            v_company_id, v_new_journal_id, v_inventory_account_id, 'Asset',
            0, 45000, 'Missing Inventory Out for SI-2026-005'
        );
        
        RAISE NOTICE 'Reconciliation Entry posted successfully.';
    ELSE
        RAISE NOTICE 'Reconciliation Entry already exists. Skipping.';
    END IF;

    -- 4. Fix the Double Reversal (Restore original journal to 'Posted' and set is_reversed = true)
    IF v_reversal_journal_id IS NOT NULL THEN
        UPDATE "GeneralLedgerJournal"
        SET status = 'Posted',
            is_reversed = true,
            notes = COALESCE(notes, '') || ' [Restored to Posted to fix double-reversal]'
        WHERE id = v_reversal_journal_id;

        RAISE NOTICE 'Double Reversal Fix applied.';
    END IF;

    -- Disable maintenance backdoor (done automatically at end of transaction due to true flag in set_config)
END $$;
