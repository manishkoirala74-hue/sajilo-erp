-- ==============================================================================
-- Migration 140: Unified Single-Ledger VAT Architecture (Nepal / South Asian Practice)
-- Aligned with Nepal VAT Act 2052 & IRD (Inland Revenue Department) accounting standards
-- ==============================================================================

DO $$
BEGIN
    -- 1. Standardize Account 2120 as unified VAT Control Account in ChartOfAccount
    UPDATE "ChartOfAccount"
    SET account_name = 'VAT Account (Payable / Refund Control)'
    WHERE account_code = '2120';

    -- 2. Align CompanySettings for all companies to point both gl_vat_payable_id
    --    and gl_vat_receivable_id to Account 2120 (Current Liability)
    UPDATE "CompanySettings" cs
    SET 
        gl_vat_payable_id = coa.id,
        gl_vat_payable_name = coa.account_name,
        gl_vat_receivable_id = coa.id,
        gl_vat_receivable_name = coa.account_name
    FROM "ChartOfAccount" coa
    WHERE coa.company_id = cs.company_id
      AND coa.account_code = '2120';

END $$;
