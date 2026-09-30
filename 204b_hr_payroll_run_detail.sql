-- Migration 204b: HR PayrollRunDetail Table
-- Created at: 2026-09-26

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS "PayrollRunDetail" (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id            UUID NOT NULL,
  payroll_run_id        UUID REFERENCES "PayrollRun"(id) ON DELETE CASCADE,
  employee_id           UUID REFERENCES "Employee"(id) ON DELETE CASCADE,
  -- Period metadata
  period_start          DATE NOT NULL,
  period_end            DATE NOT NULL,
  working_days          INTEGER DEFAULT 0,
  absent_days           INTEGER DEFAULT 0,
  -- Salary
  salary_components     JSONB NOT NULL DEFAULT '{"earnings":[],"deductions":[]}',
  base_salary           NUMERIC DEFAULT 0,
  gross_salary          NUMERIC DEFAULT 0,
  -- Automatic deductions
  unpaid_leave_deduction NUMERIC DEFAULT 0,
  loan_deduction        NUMERIC DEFAULT 0,
  total_deductions      NUMERIC DEFAULT 0,
  net_salary            NUMERIC DEFAULT 0,
  -- Status
  status                TEXT DEFAULT 'Draft',  -- 'Draft','Finalized'
  remarks               TEXT,
  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (payroll_run_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_payrollrundetail_run_id ON "PayrollRunDetail"(payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_payrollrundetail_employee_id ON "PayrollRunDetail"(employee_id);

ALTER TABLE "PayrollRunDetail" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_PayrollRunDetail" ON "PayrollRunDetail";
CREATE POLICY "select_PayrollRunDetail" ON "PayrollRunDetail" FOR SELECT USING (
  (EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin'))
  OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))
);

DROP POLICY IF EXISTS "insert_PayrollRunDetail" ON "PayrollRunDetail";
CREATE POLICY "insert_PayrollRunDetail" ON "PayrollRunDetail" FOR INSERT WITH CHECK (
  (EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin'))
  OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))
);

DROP POLICY IF EXISTS "update_PayrollRunDetail" ON "PayrollRunDetail";
CREATE POLICY "update_PayrollRunDetail" ON "PayrollRunDetail" FOR UPDATE USING (
  (EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin'))
  OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))
) WITH CHECK (
  (EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin'))
  OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))
);

DROP POLICY IF EXISTS "delete_PayrollRunDetail" ON "PayrollRunDetail";
CREATE POLICY "delete_PayrollRunDetail" ON "PayrollRunDetail" FOR DELETE USING (
  (EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin'))
  OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))
);
