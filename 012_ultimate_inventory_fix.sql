DO $$
DECLARE
    target_acc_id TEXT;
    target_acc_code TEXT;
    target_acc_name TEXT;
    updated_count INT;
BEGIN
    -- Find the account the user wants based on the screenshot
    SELECT id::text, account_code, account_name 
    INTO target_acc_id, target_acc_code, target_acc_name
    FROM "ChartOfAccount"
    WHERE account_name ILIKE '%Inventory Ledger%'
    LIMIT 1;

    -- Update any stray Purchase Invoice debit lines (that aren't taxes) to this account
    UPDATE "GeneralLedgerLine"
    SET 
        account_id = target_acc_id,
        account_code = target_acc_code,
        account_name = target_acc_name
    WHERE journal_id IN (
        SELECT id::text FROM "GeneralLedgerJournal" 
        WHERE source_document_type = 'PurchaseInvoice'
    )
    AND debit_amount > 0
    AND account_id != target_acc_id
    AND account_name NOT ILIKE '%VAT%'
    AND account_name NOT ILIKE '%Tax%'
    AND account_name NOT ILIKE '%Payable%';

END $$;
