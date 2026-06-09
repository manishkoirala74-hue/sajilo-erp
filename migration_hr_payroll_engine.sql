-- ==========================================
-- 1. SUBSIDIARY ENTITY SCHEMA UPDATE
-- ==========================================

ALTER TABLE "GeneralLedgerLine" 
ADD COLUMN IF NOT EXISTS "entity_type" TEXT, -- 'Employee', 'Customer', 'Vendor'
ADD COLUMN IF NOT EXISTS "entity_id" TEXT;

CREATE INDEX IF NOT EXISTS idx_gl_line_entity ON "GeneralLedgerLine"(company_id, entity_type, entity_id);

-- ==========================================
-- 2. SETTINGS & EMPLOYEE SCHEMA UPDATE
-- ==========================================

ALTER TABLE "CompanySettings" 
ADD COLUMN IF NOT EXISTS "hr_earning_mappings" JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS "hr_deduction_mappings" JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS "hr_salary_payable_account_id" TEXT;

ALTER TABLE "Employee"
ADD COLUMN IF NOT EXISTS "salary_components" JSONB DEFAULT '{"earnings": [], "deductions": []}'::jsonb;

-- Migrate existing employee fixed fields to JSONB for backward compatibility
UPDATE "Employee" 
SET salary_components = jsonb_build_object(
  'earnings', jsonb_build_array(
    jsonb_build_object('name', 'Base Salary', 'amount', COALESCE(base_salary, 0)),
    jsonb_build_object('name', 'HRA', 'amount', COALESCE(house_rent_allowance, 0)),
    jsonb_build_object('name', 'Transport Allowance', 'amount', COALESCE(transport_allowance, 0))
  ),
  'deductions', jsonb_build_array(
    jsonb_build_object('name', 'PF', 'percentage', COALESCE(pf_deduction_percentage, 0)),
    jsonb_build_object('name', 'TDS', 'percentage', COALESCE(tds_tax_percentage, 0))
  )
)
WHERE salary_components->>'earnings' IS NULL OR jsonb_array_length(salary_components->'earnings') = 0;

-- ==========================================
-- 3. PAYROLL RUN DETAILS SCHEMA
-- ==========================================

CREATE TABLE IF NOT EXISTS "PayrollRunDetail" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL,
  payroll_run_id UUID NOT NULL REFERENCES "PayrollRun"(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES "Employee"(id),
  employee_name TEXT,
  gross_pay NUMERIC DEFAULT 0,
  total_deductions NUMERIC DEFAULT 0,
  net_payable NUMERIC DEFAULT 0,
  components JSONB, -- stores exact breakdown of earnings/deductions for this payslip
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE "PayrollRunDetail" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all_PayrollRunDetail" ON "PayrollRunDetail" FOR ALL USING (
  (EXISTS (SELECT 1 FROM public."User" WHERE id = auth.uid() AND role = 'admin')) OR 
  (company_id IN (SELECT (company_id)::uuid FROM public."UserCompany" WHERE (user_id)::uuid = auth.uid()))
);

-- ==========================================
-- 4. BACKEND PAYROLL TRANSACTION ENGINE (RPC)
-- ==========================================

CREATE OR REPLACE FUNCTION process_payroll_run(p_company_id UUID, p_month INTEGER, p_year INTEGER, p_label TEXT)
RETURNS UUID AS $$
DECLARE
  v_settings RECORD;
  v_run_id UUID;
  v_journal_id UUID;
  v_emp RECORD;
  v_earning JSONB;
  v_deduction JSONB;
  v_total_gross NUMERIC := 0;
  v_total_pf NUMERIC := 0;
  v_total_tds NUMERIC := 0;
  v_total_net NUMERIC := 0;
  v_emp_gross NUMERIC;
  v_emp_deductions NUMERIC;
  v_emp_net NUMERIC;
  v_components JSONB;
  v_ref TEXT;
  
  -- Temporary tables to aggregate ledgers
  v_mapped_account_id TEXT;
  v_mapped_account_code TEXT;
  v_mapped_account_name TEXT;
  v_mapped_account_type TEXT;
BEGIN
  -- 1. Load Settings
  SELECT * INTO v_settings FROM "CompanySettings" WHERE company_id = p_company_id LIMIT 1;
  
  IF v_settings.hr_salary_payable_account_id IS NULL THEN
    RAISE EXCEPTION 'Salary Payable control account is not configured in Settings.';
  END IF;

  -- Create Temp tables for aggregating Debits (Earnings) and Credits (Deductions) globally
  CREATE TEMP TABLE temp_payroll_gl (
    account_id TEXT,
    account_code TEXT,
    account_name TEXT,
    account_type TEXT,
    debit_amount NUMERIC DEFAULT 0,
    credit_amount NUMERIC DEFAULT 0,
    entity_type TEXT,
    entity_id TEXT
  ) ON COMMIT DROP;

  v_ref := 'PR-' || p_year || '-' || LPAD(p_month::TEXT, 2, '0');

  -- 2. Create PayrollRun header
  INSERT INTO "PayrollRun" (company_id, run_reference, period_month, period_year, period_label, status, employee_count)
  VALUES (p_company_id, v_ref, p_month, p_year, p_label, 'Posted', 0)
  RETURNING id INTO v_run_id;

  -- 3. Create General Ledger Journal header
  -- Assuming end of month for entry date
  INSERT INTO "GeneralLedgerJournal" (company_id, entry_date, description, reference_module, source_document_id, source_document_type, status)
  VALUES (p_company_id, (DATE (p_year || '-' || p_month || '-01') + INTERVAL '1 month' - INTERVAL '1 day'), 'Payroll Run ' || p_label, 'Payroll', v_run_id::TEXT, 'PayrollRun', 'Posted')
  RETURNING id INTO v_journal_id;

  -- 4. Process Employees
  FOR v_emp IN (SELECT * FROM "Employee" WHERE company_id = p_company_id AND employment_status IN ('Permanent', 'Probation')) LOOP
    v_emp_gross := 0;
    v_emp_deductions := 0;
    v_components := '{"earnings": [], "deductions": []}'::jsonb;

    -- Process Earnings
    FOR v_earning IN SELECT * FROM jsonb_array_elements(v_emp.salary_components->'earnings') LOOP
      IF (v_earning->>'amount')::NUMERIC > 0 THEN
        v_emp_gross := v_emp_gross + (v_earning->>'amount')::NUMERIC;
        
        -- Find mapped account for this earning
        SELECT mapping->>'account_id', mapping->>'account_code', mapping->>'account_name', mapping->>'account_type'
        INTO v_mapped_account_id, v_mapped_account_code, v_mapped_account_name, v_mapped_account_type
        FROM jsonb_array_elements(v_settings.hr_earning_mappings) as mapping
        WHERE mapping->>'name' = v_earning->>'name';

        IF v_mapped_account_id IS NULL THEN
          RAISE EXCEPTION 'No GL mapping found for Earning: %', v_earning->>'name';
        END IF;

        -- Aggregate into temp table (Debits) - No entity tagging needed for aggregated expense
        INSERT INTO temp_payroll_gl (account_id, account_code, account_name, account_type, debit_amount)
        VALUES (v_mapped_account_id, v_mapped_account_code, v_mapped_account_name, v_mapped_account_type, (v_earning->>'amount')::NUMERIC);
        
        -- Push to components array
        v_components := jsonb_set(v_components, '{earnings}', (v_components->'earnings') || v_earning);
      END IF;
    END LOOP;

    -- Process Deductions
    FOR v_deduction IN SELECT * FROM jsonb_array_elements(v_emp.salary_components->'deductions') LOOP
      DECLARE
        v_deduct_amount NUMERIC := 0;
      BEGIN
        IF v_deduction ? 'percentage' AND (v_deduction->>'percentage')::NUMERIC > 0 THEN
          v_deduct_amount := v_emp_gross * ((v_deduction->>'percentage')::NUMERIC / 100);
        ELSIF v_deduction ? 'amount' AND (v_deduction->>'amount')::NUMERIC > 0 THEN
          v_deduct_amount := (v_deduction->>'amount')::NUMERIC;
        END IF;

        IF v_deduct_amount > 0 THEN
          v_emp_deductions := v_emp_deductions + v_deduct_amount;

          IF v_deduction->>'name' = 'PF' THEN v_total_pf := v_total_pf + v_deduct_amount; END IF;
          IF v_deduction->>'name' = 'TDS' THEN v_total_tds := v_total_tds + v_deduct_amount; END IF;

          -- Find mapped account for this deduction
          SELECT mapping->>'account_id', mapping->>'account_code', mapping->>'account_name', mapping->>'account_type'
          INTO v_mapped_account_id, v_mapped_account_code, v_mapped_account_name, v_mapped_account_type
          FROM jsonb_array_elements(v_settings.hr_deduction_mappings) as mapping
          WHERE mapping->>'name' = v_deduction->>'name';

          IF v_mapped_account_id IS NULL THEN
            RAISE EXCEPTION 'No GL mapping found for Deduction: %', v_deduction->>'name';
          END IF;

          -- Add to temp table (Credits). Attach entity_id so sub-ledger advances/receivables update perfectly
          INSERT INTO temp_payroll_gl (account_id, account_code, account_name, account_type, credit_amount, entity_type, entity_id)
          VALUES (v_mapped_account_id, v_mapped_account_code, v_mapped_account_name, v_mapped_account_type, v_deduct_amount, 'Employee', v_emp.id::TEXT);
          
          v_components := jsonb_set(v_components, '{deductions}', (v_components->'deductions') || jsonb_build_object('name', v_deduction->>'name', 'amount', v_deduct_amount));
        END IF;
      END;
    END LOOP;

    v_emp_net := v_emp_gross - v_emp_deductions;
    v_total_gross := v_total_gross + v_emp_gross;
    v_total_net := v_total_net + v_emp_net;

    -- Credit Net Salary Payable PER EMPLOYEE for precise Subsidiary tracking
    SELECT account_code, account_name, account_type INTO v_mapped_account_code, v_mapped_account_name, v_mapped_account_type
    FROM "ChartOfAccount" WHERE id::TEXT = v_settings.hr_salary_payable_account_id;

    INSERT INTO temp_payroll_gl (account_id, account_code, account_name, account_type, credit_amount, entity_type, entity_id)
    VALUES (v_settings.hr_salary_payable_account_id, v_mapped_account_code, v_mapped_account_name, v_mapped_account_type, v_emp_net, 'Employee', v_emp.id::TEXT);

    -- Insert Detail Record
    INSERT INTO "PayrollRunDetail" (company_id, payroll_run_id, employee_id, employee_name, gross_pay, total_deductions, net_payable, components)
    VALUES (p_company_id, v_run_id, v_emp.id, v_emp.full_name, v_emp_gross, v_emp_deductions, v_emp_net, v_components);

  END LOOP;

  -- 5. Consolidate and Insert GL Lines
  -- We aggregate expenses (Debits) normally.
  -- We aggregate payables (Credits) normally, BUT we group by entity_id so Employee Payables stay separated!
  INSERT INTO "GeneralLedgerLine" (company_id, journal_id, account_id, account_code, account_name, account_type, debit_amount, credit_amount, entity_type, entity_id)
  SELECT p_company_id, v_journal_id::TEXT, account_id, account_code, account_name, account_type, SUM(debit_amount), SUM(credit_amount), entity_type, entity_id
  FROM temp_payroll_gl
  GROUP BY account_id, account_code, account_name, account_type, entity_type, entity_id
  HAVING SUM(debit_amount) > 0 OR SUM(credit_amount) > 0;

  -- 6. Update Run Totals
  UPDATE "PayrollRun" SET 
    total_gross = v_total_gross,
    total_pf = v_total_pf,
    total_tds = v_total_tds,
    total_net = v_total_net,
    employee_count = (SELECT COUNT(*) FROM "PayrollRunDetail" WHERE payroll_run_id = v_run_id)
  WHERE id = v_run_id;

  -- Update Journal Totals
  UPDATE "GeneralLedgerJournal" SET
    total_debit = (SELECT SUM(debit_amount) FROM "GeneralLedgerLine" WHERE journal_id = v_journal_id::TEXT),
    total_credit = (SELECT SUM(credit_amount) FROM "GeneralLedgerLine" WHERE journal_id = v_journal_id::TEXT)
  WHERE id = v_journal_id;

  RETURN v_run_id;
END;
$$ LANGUAGE plpgsql;
