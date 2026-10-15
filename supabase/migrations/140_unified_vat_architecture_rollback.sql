-- ==============================================================================
-- Rollback 140: Revert Unified VAT to Dual-Ledger Western Model (1510 / 2120)
-- ==============================================================================

DO $$
BEGIN
    -- 1. Revert Account 2120 name back to 'VAT Payable'
    UPDATE "ChartOfAccount"
    SET account_name = 'VAT Payable'
    WHERE account_code = '2120';

    -- 2. Revert gl_vat_receivable_id to point back to Account 1510 (VAT Receivable)
    UPDATE "CompanySettings" cs
    SET 
        gl_vat_receivable_id = coa.id,
        gl_vat_receivable_name = coa.account_name
    FROM "ChartOfAccount" coa
    WHERE coa.company_id = cs.company_id
      AND coa.account_code = '1510';

END $$;
