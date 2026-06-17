-- =========================================================================================
-- 038_ledger_hardening_core.sql - DATABASE STRUCTURAL UPGRADE (TEXT -> UUID)
-- =========================================================================================

BEGIN;

ALTER TABLE "GeneralLedgerLine"
  ALTER COLUMN journal_id TYPE UUID USING NULLIF(TRIM(journal_id), '')::UUID,
  ALTER COLUMN account_id TYPE UUID USING NULLIF(TRIM(account_id), '')::UUID,
  ALTER COLUMN entity_id TYPE UUID USING NULLIF(TRIM(entity_id), '')::UUID;

ALTER TABLE "GeneralLedgerJournal"
  ALTER COLUMN source_document_id TYPE UUID USING NULLIF(TRIM(source_document_id), '')::UUID;

ALTER TABLE "ChartOfAccount"
  ALTER COLUMN parent_account_id TYPE UUID USING NULLIF(TRIM(parent_account_id), '')::UUID;

ALTER TABLE "BusinessPartner"
  ALTER COLUMN receivable_account_id TYPE UUID USING NULLIF(TRIM(receivable_account_id), '')::UUID,
  ALTER COLUMN payable_account_id TYPE UUID USING NULLIF(TRIM(payable_account_id), '')::UUID;

ALTER TABLE "BankAccount"
  ALTER COLUMN gl_account_id TYPE UUID USING NULLIF(TRIM(gl_account_id), '')::UUID,
  ALTER COLUMN ledger_group_id TYPE UUID USING NULLIF(TRIM(ledger_group_id), '')::UUID;

ALTER TABLE "CompanySettings"
  ALTER COLUMN dep_factory_expense_account_id TYPE UUID USING NULLIF(TRIM(dep_factory_expense_account_id), '')::UUID,
  ALTER COLUMN dep_admin_expense_account_id TYPE UUID USING NULLIF(TRIM(dep_admin_expense_account_id), '')::UUID,
  ALTER COLUMN dep_accumulated_machinery_account_id TYPE UUID USING NULLIF(TRIM(dep_accumulated_machinery_account_id), '')::UUID,
  ALTER COLUMN dep_accumulated_office_account_id TYPE UUID USING NULLIF(TRIM(dep_accumulated_office_account_id), '')::UUID,
  ALTER COLUMN dep_accumulated_vehicle_account_id TYPE UUID USING NULLIF(TRIM(dep_accumulated_vehicle_account_id), '')::UUID,
  ALTER COLUMN gl_cash_account_id TYPE UUID USING NULLIF(TRIM(gl_cash_account_id), '')::UUID,
  ALTER COLUMN gl_bank_account_id TYPE UUID USING NULLIF(TRIM(gl_bank_account_id), '')::UUID,
  ALTER COLUMN gl_accounts_receivable_id TYPE UUID USING NULLIF(TRIM(gl_accounts_receivable_id), '')::UUID,
  ALTER COLUMN gl_accounts_payable_id TYPE UUID USING NULLIF(TRIM(gl_accounts_payable_id), '')::UUID,
  ALTER COLUMN gl_vat_payable_id TYPE UUID USING NULLIF(TRIM(gl_vat_payable_id), '')::UUID,
  ALTER COLUMN gl_sales_return_account_id TYPE UUID USING NULLIF(TRIM(gl_sales_return_account_id), '')::UUID,
  ALTER COLUMN gl_purchase_return_account_id TYPE UUID USING NULLIF(TRIM(gl_purchase_return_account_id), '')::UUID,
  ALTER COLUMN gl_default_sales_account_id TYPE UUID USING NULLIF(TRIM(gl_default_sales_account_id), '')::UUID,
  ALTER COLUMN gl_default_cogs_account_id TYPE UUID USING NULLIF(TRIM(gl_default_cogs_account_id), '')::UUID,
  ALTER COLUMN gl_default_inventory_account_id TYPE UUID USING NULLIF(TRIM(gl_default_inventory_account_id), '')::UUID,
  ALTER COLUMN gl_stock_variance_account_id TYPE UUID USING NULLIF(TRIM(gl_stock_variance_account_id), '')::UUID,
  ALTER COLUMN gl_opening_equity_account_id TYPE UUID USING NULLIF(TRIM(gl_opening_equity_account_id), '')::UUID,
  ALTER COLUMN gl_customer_ledger_group_id TYPE UUID USING NULLIF(TRIM(gl_customer_ledger_group_id), '')::UUID,
  ALTER COLUMN gl_supplier_ledger_group_id TYPE UUID USING NULLIF(TRIM(gl_supplier_ledger_group_id), '')::UUID,
  ALTER COLUMN gl_dual_ledger_group_id TYPE UUID USING NULLIF(TRIM(gl_dual_ledger_group_id), '')::UUID;

ALTER TABLE "UserCompany"
  ALTER COLUMN user_id TYPE UUID USING NULLIF(TRIM(user_id), '')::UUID,
  ALTER COLUMN company_id TYPE UUID USING NULLIF(TRIM(company_id), '')::UUID;

ALTER TABLE "Item"
  ALTER COLUMN category_id TYPE UUID USING NULLIF(TRIM(category_id), '')::UUID,
  ALTER COLUMN purchase_account_id TYPE UUID USING NULLIF(TRIM(purchase_account_id), '')::UUID,
  ALTER COLUMN sales_account_id TYPE UUID USING NULLIF(TRIM(sales_account_id), '')::UUID,
  ALTER COLUMN inventory_account_id TYPE UUID USING NULLIF(TRIM(inventory_account_id), '')::UUID,
  ALTER COLUMN discount_scheme_id TYPE UUID USING NULLIF(TRIM(discount_scheme_id), '')::UUID;

ALTER TABLE "ItemCategory"
  ALTER COLUMN parent_category_id TYPE UUID USING NULLIF(TRIM(parent_category_id), '')::UUID,
  ALTER COLUMN purchase_account_id TYPE UUID USING NULLIF(TRIM(purchase_account_id), '')::UUID,
  ALTER COLUMN sales_account_id TYPE UUID USING NULLIF(TRIM(sales_account_id), '')::UUID,
  ALTER COLUMN discount_scheme_id TYPE UUID USING NULLIF(TRIM(discount_scheme_id), '')::UUID;

ALTER TABLE "DiscountScheme"
  ALTER COLUMN item_id TYPE UUID USING NULLIF(TRIM(item_id), '')::UUID,
  ALTER COLUMN category_id TYPE UUID USING NULLIF(TRIM(category_id), '')::UUID;

ALTER TABLE "SalesInvoice"
  ALTER COLUMN customer_id TYPE UUID USING NULLIF(TRIM(customer_id), '')::UUID,
  ALTER COLUMN sales_order_id TYPE UUID USING NULLIF(TRIM(sales_order_id), '')::UUID;

ALTER TABLE "SalesReturn"
  ALTER COLUMN customer_id TYPE UUID USING NULLIF(TRIM(customer_id), '')::UUID,
  ALTER COLUMN sales_invoice_id TYPE UUID USING NULLIF(TRIM(sales_invoice_id), '')::UUID,
  ALTER COLUMN pos_sale_id TYPE UUID USING NULLIF(TRIM(pos_sale_id), '')::UUID;

ALTER TABLE "SalesOrder"
  ALTER COLUMN customer_id TYPE UUID USING NULLIF(TRIM(customer_id), '')::UUID;

ALTER TABLE "POSSale"
  ALTER COLUMN customer_id TYPE UUID USING NULLIF(TRIM(customer_id), '')::UUID;

ALTER TABLE "Quotation"
  ALTER COLUMN customer_id TYPE UUID USING NULLIF(TRIM(customer_id), '')::UUID,
  ALTER COLUMN converted_to_order_id TYPE UUID USING NULLIF(TRIM(converted_to_order_id), '')::UUID,
  ALTER COLUMN converted_to_invoice_id TYPE UUID USING NULLIF(TRIM(converted_to_invoice_id), '')::UUID;

ALTER TABLE "PurchaseInvoice"
  ALTER COLUMN vendor_id TYPE UUID USING NULLIF(TRIM(vendor_id), '')::UUID,
  ALTER COLUMN po_reference_id TYPE UUID USING NULLIF(TRIM(po_reference_id), '')::UUID;

ALTER TABLE "PurchaseReturn"
  ALTER COLUMN vendor_id TYPE UUID USING NULLIF(TRIM(vendor_id), '')::UUID,
  ALTER COLUMN purchase_invoice_id TYPE UUID USING NULLIF(TRIM(purchase_invoice_id), '')::UUID;

ALTER TABLE "PurchaseOrder"
  ALTER COLUMN vendor_id TYPE UUID USING NULLIF(TRIM(vendor_id), '')::UUID;

ALTER TABLE "SalesInvoiceLine"
  ALTER COLUMN item_id TYPE UUID USING NULLIF(TRIM(item_id), '')::UUID;

ALTER TABLE "PurchaseInvoiceLine"
  ALTER COLUMN item_id TYPE UUID USING NULLIF(TRIM(item_id), '')::UUID;

ALTER TABLE "ManufacturingOrder"
  ALTER COLUMN product_item_id TYPE UUID USING NULLIF(TRIM(product_item_id), '')::UUID;

ALTER TABLE "FinancialVoucher"
  ALTER COLUMN contact_id TYPE UUID USING NULLIF(TRIM(contact_id), '')::UUID;

ALTER TABLE "FixedAsset"
  ALTER COLUMN parent_asset_id TYPE UUID USING NULLIF(TRIM(parent_asset_id), '')::UUID,
  ALTER COLUMN asset_ledger_id TYPE UUID USING NULLIF(TRIM(asset_ledger_id), '')::UUID,
  ALTER COLUMN accumulated_dep_ledger_id TYPE UUID USING NULLIF(TRIM(accumulated_dep_ledger_id), '')::UUID,
  ALTER COLUMN dep_expense_ledger_id TYPE UUID USING NULLIF(TRIM(dep_expense_ledger_id), '')::UUID,
  ALTER COLUMN payment_account_id TYPE UUID USING NULLIF(TRIM(payment_account_id), '')::UUID;

ALTER TABLE "AssetComplianceSchedule"
  ALTER COLUMN asset_id TYPE UUID USING NULLIF(TRIM(asset_id), '')::UUID;

ALTER TABLE "DepreciationSchedule"
  ALTER COLUMN asset_id TYPE UUID USING NULLIF(TRIM(asset_id), '')::UUID;

ALTER TABLE "FinancialVoucherDeleteLog"
  ALTER COLUMN voucher_id TYPE UUID USING NULLIF(TRIM(voucher_id), '')::UUID;

ALTER TABLE "ItemDeleteLog"
  ALTER COLUMN item_id TYPE UUID USING NULLIF(TRIM(item_id), '')::UUID;

ALTER TABLE "PartnerDeleteLog"
  ALTER COLUMN partner_id TYPE UUID USING NULLIF(TRIM(partner_id), '')::UUID;

ALTER TABLE "FixedAssetDeleteLog"
  ALTER COLUMN asset_id TYPE UUID USING NULLIF(TRIM(asset_id), '')::UUID;

ALTER TABLE "OpeningBalanceLog"
  ALTER COLUMN account_id TYPE UUID USING NULLIF(TRIM(account_id), '')::UUID;

-- Adding Strict Foreign Key Constraints for Core Ledger
ALTER TABLE "GeneralLedgerLine"
  ADD CONSTRAINT fk_gll_journal FOREIGN KEY (journal_id) REFERENCES "GeneralLedgerJournal"(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_gll_account FOREIGN KEY (account_id) REFERENCES "ChartOfAccount"(id) ON DELETE RESTRICT;

COMMIT;

-- =========================================================================================
-- 2. ENFORCING BALANCED ENTRIES & ATOMICITY
-- =========================================================================================

CREATE OR REPLACE FUNCTION rpc_commit_journal_entry_internal(
    p_company_id UUID,
    p_date DATE,
    p_narration TEXT,
    p_module TEXT,
    p_source_id UUID,
    p_source_type TEXT,
    p_reference TEXT,
    p_lines JSONB
) RETURNS UUID AS $$
DECLARE
    v_journal_id UUID;
    v_line JSONB;
    v_total_debit NUMERIC := 0;
    v_total_credit NUMERIC := 0;
BEGIN
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
        v_total_debit := v_total_debit + COALESCE((v_line->>'debit_amount')::NUMERIC, 0);
        v_total_credit := v_total_credit + COALESCE((v_line->>'credit_amount')::NUMERIC, 0);
    END LOOP;

    IF ABS(v_total_debit - v_total_credit) > 0.001 THEN
        RAISE EXCEPTION 'ERR_UNBALANCED_JOURNAL: Total Debit (%) does not equal Total Credit (%)', v_total_debit, v_total_credit;
    END IF;

    INSERT INTO "GeneralLedgerJournal" (
        company_id, entry_date, narration, reference_module, source_document_id, source_document_type, reference_number, total_amount, status
    ) VALUES (
        p_company_id, p_date, p_narration, p_module, p_source_id, p_source_type, p_reference, v_total_debit, 'Posted'
    ) RETURNING id INTO v_journal_id;

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
        IF COALESCE((v_line->>'debit_amount')::NUMERIC, 0) > 0 OR COALESCE((v_line->>'credit_amount')::NUMERIC, 0) > 0 THEN
            INSERT INTO "GeneralLedgerLine" (
                company_id, journal_id, account_id, account_category, description, debit_amount, credit_amount, entity_type, entity_id, due_date
            ) VALUES (
                p_company_id,
                v_journal_id,
                NULLIF(TRIM(v_line->>'account_id'), '')::UUID,
                v_line->>'account_category',
                v_line->>'description',
                COALESCE((v_line->>'debit_amount')::NUMERIC, 0),
                COALESCE((v_line->>'credit_amount')::NUMERIC, 0),
                v_line->>'entity_type',
                NULLIF(TRIM(v_line->>'entity_id'), '')::UUID,
                (v_line->>'due_date')::DATE
            );
        END IF;
    END LOOP;

    RETURN v_journal_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION rpc_delete_gl_journals(p_source_id UUID, p_source_type TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM "GeneralLedgerLine" 
    WHERE journal_id IN (
        SELECT id FROM "GeneralLedgerJournal" 
        WHERE source_document_id = p_source_id 
          AND source_document_type = p_source_type
    );
    
    DELETE FROM "GeneralLedgerJournal" 
    WHERE source_document_id = p_source_id 
      AND source_document_type = p_source_type;
END;
$$;

CREATE OR REPLACE FUNCTION rpc_post_financial_voucher(
    p_company_id UUID,
    p_voucher_id UUID,
    p_idempotency_key UUID,
    p_gl_lines JSONB,
    p_is_reversal BOOLEAN DEFAULT false
) RETURNS JSONB AS $$
DECLARE
    v_journal_id UUID;
    v_voucher RECORD;
BEGIN
    SELECT * INTO v_voucher FROM "FinancialVoucher" WHERE idempotency_key = p_idempotency_key LIMIT 1;
    IF v_voucher.id IS NOT NULL THEN RETURN jsonb_build_object('status', 'duplicate', 'journal_id', v_voucher.gl_journal_id); END IF;

    SELECT * INTO v_voucher FROM "FinancialVoucher" WHERE id = p_voucher_id;
    
    IF p_is_reversal THEN 
        DELETE FROM "GeneralLedgerLine" 
        WHERE journal_id IN (
            SELECT id FROM "GeneralLedgerJournal" 
            WHERE source_document_id = p_voucher_id 
              AND source_document_type = 'FinancialVoucher'
        );
        
        DELETE FROM "GeneralLedgerJournal" 
        WHERE source_document_id = p_voucher_id 
          AND source_document_type = 'FinancialVoucher';
    END IF;

    v_journal_id := rpc_commit_journal_entry_internal(
        p_company_id, 
        v_voucher.voucher_date::DATE, 
        COALESCE(v_voucher.narration, ''),
        'Vouchers', 
        p_voucher_id, 
        'FinancialVoucher', 
        COALESCE(v_voucher.voucher_number, ''), 
        p_gl_lines
    );

    UPDATE "FinancialVoucher" 
    SET status = 'Posted', gl_journal_id = v_journal_id, idempotency_key = p_idempotency_key 
    WHERE id = p_voucher_id;
    
    RETURN jsonb_build_object('status', 'success', 'journal_id', v_journal_id);
END;
$$ LANGUAGE plpgsql;

-- =========================================================================================
-- 3. UNIFIED REPORTING PATCHES (DYNAMIC NATIVE UUID JOINS)
-- =========================================================================================

CREATE OR REPLACE FUNCTION get_trial_balance_rpc(p_company_id UUID, p_from_date DATE, p_to_date DATE)
  RETURNS TABLE (
    id UUID,
    account_code TEXT,
    account_name TEXT,
    account_type TEXT,
    ledger_type TEXT,
    parent_account_id UUID,
    opening_debit NUMERIC,
    opening_credit NUMERIC,
    current_debit NUMERIC,
    current_credit NUMERIC,
    closing_debit NUMERIC,
    closing_credit NUMERIC
  ) LANGUAGE plpgsql AS $$
  BEGIN
    RETURN QUERY
    WITH account_activity AS (
      SELECT
        l.account_id,
        SUM(CASE WHEN j.entry_date::DATE < p_from_date THEN l.debit_amount ELSE 0 END) as ob_dr,
        SUM(CASE WHEN j.entry_date::DATE < p_from_date THEN l.credit_amount ELSE 0 END) as ob_cr,
        SUM(CASE WHEN j.entry_date::DATE >= p_from_date AND j.entry_date::DATE <= p_to_date THEN l.debit_amount ELSE 0 END) as cur_dr,
        SUM(CASE WHEN j.entry_date::DATE >= p_from_date AND j.entry_date::DATE <= p_to_date THEN l.credit_amount ELSE 0 END) as cur_cr
      FROM "GeneralLedgerLine" l
      JOIN "GeneralLedgerJournal" j ON l.journal_id = j.id
      WHERE j.status = 'Posted'
        AND l.company_id = p_company_id
        AND j.company_id = p_company_id
      GROUP BY l.account_id
    )
    SELECT 
      a.id,
      a.account_code,
      a.account_name,
      a.account_type,
      a.ledger_type,
      a.parent_account_id,
      
      -- Opening Balances
      CASE WHEN a.account_type IN ('Asset','COGS','Expense','OPEX','Cost of Goods Sold','Other Expense') THEN
        CASE WHEN (COALESCE(aa.ob_dr, 0) - COALESCE(aa.ob_cr, 0)) >= 0 THEN COALESCE(aa.ob_dr, 0) - COALESCE(aa.ob_cr, 0) ELSE 0 END
      ELSE
        CASE WHEN (COALESCE(aa.ob_dr, 0) - COALESCE(aa.ob_cr, 0)) > 0 THEN COALESCE(aa.ob_dr, 0) - COALESCE(aa.ob_cr, 0) ELSE 0 END
      END AS opening_debit,
  
      CASE WHEN a.account_type NOT IN ('Asset','COGS','Expense','OPEX','Cost of Goods Sold','Other Expense') THEN
        CASE WHEN (COALESCE(aa.ob_cr, 0) - COALESCE(aa.ob_dr, 0)) >= 0 THEN COALESCE(aa.ob_cr, 0) - COALESCE(aa.ob_dr, 0) ELSE 0 END
      ELSE
        CASE WHEN (COALESCE(aa.ob_cr, 0) - COALESCE(aa.ob_dr, 0)) > 0 THEN COALESCE(aa.ob_cr, 0) - COALESCE(aa.ob_dr, 0) ELSE 0 END
      END AS opening_credit,
  
      -- Current Balances
      COALESCE(aa.cur_dr, 0) AS current_debit,
      COALESCE(aa.cur_cr, 0) AS current_credit,
  
      -- Closing Balances
      CASE WHEN a.account_type IN ('Asset','COGS','Expense','OPEX','Cost of Goods Sold','Other Expense') THEN
        CASE WHEN ((COALESCE(aa.ob_dr, 0) + COALESCE(aa.cur_dr, 0)) - (COALESCE(aa.ob_cr, 0) + COALESCE(aa.cur_cr, 0))) >= 0 
        THEN (COALESCE(aa.ob_dr, 0) + COALESCE(aa.cur_dr, 0)) - (COALESCE(aa.ob_cr, 0) + COALESCE(aa.cur_cr, 0)) ELSE 0 END
      ELSE
        CASE WHEN ((COALESCE(aa.ob_dr, 0) + COALESCE(aa.cur_dr, 0)) - (COALESCE(aa.ob_cr, 0) + COALESCE(aa.cur_cr, 0))) > 0 
        THEN (COALESCE(aa.ob_dr, 0) + COALESCE(aa.cur_dr, 0)) - (COALESCE(aa.ob_cr, 0) + COALESCE(aa.cur_cr, 0)) ELSE 0 END
      END AS closing_debit,
  
      CASE WHEN a.account_type NOT IN ('Asset','COGS','Expense','OPEX','Cost of Goods Sold','Other Expense') THEN
        CASE WHEN ((COALESCE(aa.ob_cr, 0) + COALESCE(aa.cur_cr, 0)) - (COALESCE(aa.ob_dr, 0) + COALESCE(aa.cur_dr, 0))) >= 0 
        THEN (COALESCE(aa.ob_cr, 0) + COALESCE(aa.cur_cr, 0)) - (COALESCE(aa.ob_dr, 0) + COALESCE(aa.cur_dr, 0)) ELSE 0 END
      ELSE
        CASE WHEN ((COALESCE(aa.ob_cr, 0) + COALESCE(aa.cur_cr, 0)) - (COALESCE(aa.ob_dr, 0) + COALESCE(aa.cur_dr, 0))) > 0 
        THEN (COALESCE(aa.ob_cr, 0) + COALESCE(aa.cur_cr, 0)) - (COALESCE(aa.ob_dr, 0) + COALESCE(aa.cur_dr, 0)) ELSE 0 END
      END AS closing_credit
  
    FROM "ChartOfAccount" a
    LEFT JOIN account_activity aa ON a.id = aa.account_id
    WHERE a.company_id = p_company_id
      AND a.is_active = true
      AND a.ledger_type = 'Sub Ledger'
      AND a.account_code IS NOT NULL AND a.account_code != '?"'
      AND (
        COALESCE(aa.ob_dr, 0) > 0 OR COALESCE(aa.ob_cr, 0) > 0 OR 
        COALESCE(aa.cur_dr, 0) > 0 OR COALESCE(aa.cur_cr, 0) > 0
      );
  END;
  $$;

CREATE OR REPLACE FUNCTION get_sales_summary_rpc(p_company_id UUID, p_from_date DATE, p_to_date DATE)
RETURNS TABLE (
    entry_date DATE,
    voucher_no TEXT,
    net_revenue NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        j.entry_date,
        j.voucher_no,
        SUM(l.credit_amount) - SUM(l.debit_amount) as net_revenue
    FROM "GeneralLedgerLine" l
    JOIN "GeneralLedgerJournal" j ON l.journal_id = j.id
    JOIN "ChartOfAccount" c ON l.account_id = c.id
    WHERE c.account_type IN ('Revenue', 'Other Income')
      AND j.status = 'Posted'
      AND (p_company_id IS NULL OR j.company_id = p_company_id)
      AND (p_from_date IS NULL OR j.entry_date >= p_from_date)
      AND (p_to_date IS NULL OR j.entry_date <= p_to_date)
    GROUP BY j.entry_date, j.voucher_no
    HAVING (SUM(l.credit_amount) - SUM(l.debit_amount)) <> 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_purchase_summary_rpc(p_company_id UUID, p_from_date DATE, p_to_date DATE)
RETURNS TABLE (
    entry_date DATE,
    voucher_no TEXT,
    net_expense NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        j.entry_date,
        j.voucher_no,
        SUM(l.debit_amount) - SUM(l.credit_amount) as net_expense
    FROM "GeneralLedgerLine" l
    JOIN "GeneralLedgerJournal" j ON l.journal_id = j.id
    JOIN "ChartOfAccount" c ON l.account_id = c.id
    WHERE c.account_type IN ('Expense', 'Cost of Goods Sold', 'OPEX', 'Other Expense')
      AND j.status = 'Posted'
      AND (p_company_id IS NULL OR j.company_id = p_company_id)
      AND (p_from_date IS NULL OR j.entry_date >= p_from_date)
      AND (p_to_date IS NULL OR j.entry_date <= p_to_date)
    GROUP BY j.entry_date, j.voucher_no
    HAVING (SUM(l.debit_amount) - SUM(l.credit_amount)) <> 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
