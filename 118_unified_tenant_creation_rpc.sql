-- 118_unified_tenant_creation_rpc.sql

-- 1. Revert previous UserCompany RLS weakening to maintain absolute strictness
DROP POLICY IF EXISTS "insert_UserCompany" ON "UserCompany";

CREATE POLICY "insert_UserCompany" ON "UserCompany"
  FOR INSERT TO authenticated
  WITH CHECK (
    is_current_user_super_admin()
    OR is_tenant_admin_for_company(company_id::uuid)
  );

-- 2. Create the unified RPC for tenant creation
CREATE OR REPLACE FUNCTION public.create_new_tenant(p_company_data JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$$
DECLARE
    v_user_id TEXT;
    v_new_company_id UUID;
    v_id_assets UUID := uuid_generate_v4();
    v_id_liab UUID := uuid_generate_v4();
    v_id_eq UUID := uuid_generate_v4();
    v_id_rev UUID := uuid_generate_v4();
    v_id_exp UUID := uuid_generate_v4();
BEGIN
    v_user_id := auth.uid()::text;
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- 1. Insert into Company
    INSERT INTO "Company" (
        name, tax_id, address, phone, email, website, logo_url, created_by
    )
    VALUES (
        p_company_data->>'name',
        p_company_data->>'tax_id',
        p_company_data->>'address',
        p_company_data->>'phone',
        p_company_data->>'email',
        p_company_data->>'website',
        p_company_data->>'logo_url',
        v_user_id
    )
    RETURNING id INTO v_new_company_id;

    -- 2. Link creator as Tenant Admin
    INSERT INTO "UserCompany" (user_id, company_id, is_tenant_admin, is_default)
    VALUES (v_user_id, v_new_company_id::text, true, true);

    -- 3. Bootstrap CompanySettings
    INSERT INTO "CompanySettings" (
        company_id, company_name, tax_id, company_logo_url
    )
    VALUES (
        v_new_company_id,
        p_company_data->>'name',
        p_company_data->>'tax_id',
        p_company_data->>'logo_url'
    );

    -- 4. Bootstrap Fiscal Year
    IF p_company_data->'initial_fiscal_year' IS NOT NULL THEN
        INSERT INTO "FiscalYear" (
            company_id, fiscal_year_name, start_date, end_date, is_active
        )
        VALUES (
            v_new_company_id,
            p_company_data->'initial_fiscal_year'->>'name',
            (p_company_data->'initial_fiscal_year'->>'start_date')::DATE,
            (p_company_data->'initial_fiscal_year'->>'end_date')::DATE,
            true
        );
    END IF;

    -- 5. Bootstrap Cooperative Chart of Accounts
    INSERT INTO "ChartOfAccount" (
        id, company_id, account_code, account_name, account_type, ledger_type, 
        statement_type, statement_group, is_system_account, parent_account_id, normal_balance
    )
    VALUES 
        -- Pillars
        (v_id_assets, v_new_company_id, '1000', 'Assets', 'Asset', 'Group Ledger', 'balance_sheet', 'Assets', true, null, 'Debit'),
        (v_id_liab, v_new_company_id, '2000', 'Liabilities', 'Liability', 'Group Ledger', 'balance_sheet', 'Liabilities', true, null, 'Credit'),
        (v_id_eq, v_new_company_id, '3000', 'Equity', 'Equity', 'Group Ledger', 'balance_sheet', 'Equity', true, null, 'Credit'),
        (v_id_rev, v_new_company_id, '4000', 'Revenue', 'Revenue', 'Group Ledger', 'income_statement', 'Revenue', true, null, 'Credit'),
        (v_id_exp, v_new_company_id, '5000', 'Operating Expenses', 'Expense', 'Group Ledger', 'income_statement', 'Operating Expenses', true, null, 'Debit'),
        
        -- Cooperative Control Accounts
        (uuid_generate_v4(), v_new_company_id, '1400', 'Member Loan Advances', 'Asset', 'Sub Ledger', 'balance_sheet', 'Assets', true, v_id_assets::text, 'Debit'),
        (uuid_generate_v4(), v_new_company_id, '2300', 'Savings Deposits', 'Liability', 'Sub Ledger', 'balance_sheet', 'Liabilities', true, v_id_liab::text, 'Credit'),
        (uuid_generate_v4(), v_new_company_id, '3400', 'Member Share Capital', 'Equity', 'Sub Ledger', 'balance_sheet', 'Equity', true, v_id_eq::text, 'Credit');

    RETURN v_new_company_id;
END;
$$$;

-- Secure the RPC
REVOKE EXECUTE ON FUNCTION public.create_new_tenant(JSONB) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_new_tenant(JSONB) TO authenticated;
