-- Supabase Schema Generated from sajilo entities

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS "AssetComplianceSchedule" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID,
  "asset_id" TEXT,
  "asset_name" TEXT NOT NULL,
  "event_type" TEXT,
  "event_name" TEXT NOT NULL,
  "frequency_months" INTEGER DEFAULT 12,
  "last_completed_date" TIMESTAMP WITH TIME ZONE,
  "next_due_date" TIMESTAMP WITH TIME ZONE,
  "reminder_lead_days" INTEGER DEFAULT 30,
  "assigned_user" TEXT,
  "status" TEXT DEFAULT 'Safe',
  "completion_notes" TEXT,
  "document_urls" JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

ALTER TABLE "AssetComplianceSchedule" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_AssetComplianceSchedule" ON "AssetComplianceSchedule" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_AssetComplianceSchedule" ON "AssetComplianceSchedule" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_AssetComplianceSchedule" ON "AssetComplianceSchedule" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_AssetComplianceSchedule" ON "AssetComplianceSchedule" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

CREATE TABLE IF NOT EXISTS "BankAccount" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID,
  "account_name" TEXT NOT NULL,
  "account_type" TEXT NOT NULL DEFAULT 'Bank',
  "account_holder_name" TEXT,
  "bank_name" TEXT,
  "branch_name" TEXT,
  "account_number" TEXT,
  "account_category" TEXT DEFAULT 'Current',
  "currency" TEXT DEFAULT 'NPR',
  "opening_balance" NUMERIC DEFAULT 0,
  "current_balance" NUMERIC DEFAULT 0,
  "gl_account_id" TEXT,
  "gl_account_name" TEXT,
  "ledger_group_id" TEXT,
  "ledger_group_name" TEXT,
  "ifsc_code" TEXT,
  "swift_code" TEXT,
  "contact_person" TEXT,
  "contact_phone" TEXT,
  "notes" TEXT,
  "document_urls" JSONB,
  "is_active" BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

ALTER TABLE "BankAccount" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_BankAccount" ON "BankAccount" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_BankAccount" ON "BankAccount" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_BankAccount" ON "BankAccount" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_BankAccount" ON "BankAccount" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

CREATE TABLE IF NOT EXISTS "BusinessPartner" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID,
  "partner_code" TEXT,
  "name" TEXT NOT NULL,
  "partner_type" TEXT DEFAULT 'Company',
  "tax_id_number" TEXT,
  "is_customer" BOOLEAN DEFAULT false,
  "is_vendor" BOOLEAN DEFAULT false,
  "treat_as_customer" BOOLEAN DEFAULT false,
  "treated_as_vendor" BOOLEAN DEFAULT false,
  "is_active" BOOLEAN DEFAULT true,
  "credit_limit_amount" NUMERIC DEFAULT 0,
  "default_payment_term_days" INTEGER DEFAULT 30,
  "email" TEXT,
  "phone" TEXT,
  "address" TEXT,
  "city" TEXT,
  "country" TEXT DEFAULT 'Nepal',
  "profile_image_url" TEXT,
  "notes" TEXT,
  "receivable_account_id" TEXT,
  "receivable_account_name" TEXT,
  "receivable_account_code" TEXT,
  "payable_account_id" TEXT,
  "payable_account_name" TEXT,
  "payable_account_code" TEXT,
  "opening_balance" NUMERIC DEFAULT 0,
  "opening_balance_type" TEXT DEFAULT 'Dr',
  "opening_balance_date" TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

ALTER TABLE "BusinessPartner" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_BusinessPartner" ON "BusinessPartner" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_BusinessPartner" ON "BusinessPartner" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_BusinessPartner" ON "BusinessPartner" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_BusinessPartner" ON "BusinessPartner" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

CREATE TABLE IF NOT EXISTS "ChartOfAccount" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID,
  "account_code" TEXT NOT NULL,
  "account_name" TEXT NOT NULL,
  "account_type" TEXT NOT NULL,
  "account_subtype" TEXT,
  "ifrs_reference" TEXT,
  "ledger_type" TEXT NOT NULL DEFAULT 'Sub Ledger',
  "parent_account_id" TEXT,
  "parent_account_name" TEXT,
  "normal_balance" TEXT,
  "current_balance" NUMERIC DEFAULT 0,
  "is_active" BOOLEAN DEFAULT true,
  "is_system_account" BOOLEAN DEFAULT false,
  "description" TEXT,
  "notes" TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

ALTER TABLE "ChartOfAccount" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_ChartOfAccount" ON "ChartOfAccount" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_ChartOfAccount" ON "ChartOfAccount" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_ChartOfAccount" ON "ChartOfAccount" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_ChartOfAccount" ON "ChartOfAccount" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

CREATE TABLE IF NOT EXISTS "Company" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "name" TEXT NOT NULL,
  "tax_id" TEXT,
  "registration_number" TEXT,
  "address" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "website" TEXT,
  "logo_url" TEXT,
  "is_active" BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

ALTER TABLE "Company" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all for authenticated users" ON "Company" FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS "CompanySettings" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID,
  "company_name" TEXT NOT NULL,
  "company_logo_url" TEXT,
  "address" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "tax_id" TEXT,
  "currency" TEXT DEFAULT 'NPR',
  "fiscal_year_start" TEXT DEFAULT '2026-04-01',
  "vat_rate" NUMERIC DEFAULT 13,
  "tax_charge_type" TEXT DEFAULT 'Exclusive',
  "default_payment_term_days" INTEGER DEFAULT 30,
  "enable_purchase_orders" BOOLEAN DEFAULT true,
  "enable_approvals" BOOLEAN DEFAULT true,
  "approval_limit_amount" NUMERIC DEFAULT 50000,
  "enable_landed_costs" BOOLEAN DEFAULT false,
  "date_format" TEXT DEFAULT 'AD',
  "item_image_max_size_mb" NUMERIC DEFAULT 2,
  "item_image_max_count" INTEGER DEFAULT 3,
  "invoice_prefix_sales" TEXT DEFAULT 'SI',
  "invoice_prefix_purchase" TEXT DEFAULT 'PI',
  "invoice_prefix_sales_order" TEXT DEFAULT 'SO',
  "invoice_prefix_purchase_order" TEXT DEFAULT 'PO',
  "invoice_suffix" TEXT DEFAULT '',
  "invoice_next_number" INTEGER DEFAULT 1,
  "invoice_numbering_method" TEXT DEFAULT 'Auto',
  "invoice_duplicate_handling" TEXT DEFAULT 'Block',
  "overdue_reminder_days" INTEGER DEFAULT 7,
  "send_invoice_reminder_on_due" BOOLEAN DEFAULT true,
  "self_reminder_days_before_due" INTEGER DEFAULT 3,
  "email_smtp_host" TEXT,
  "email_smtp_port" INTEGER DEFAULT 587,
  "email_smtp_user" TEXT,
  "email_smtp_password" TEXT,
  "email_from_name" TEXT,
  "email_debtor_template" TEXT DEFAULT 'Dear {customer_name},

This is a reminder that invoice {invoice_number} for NPR {amount} is due on {due_date}.

Please make the payment at your earliest convenience.

Regards,
{company_name}',
  "opening_balance_date" TIMESTAMP WITH TIME ZONE,
  "enable_pos_module" BOOLEAN DEFAULT true,
  "enable_manufacturing_module" BOOLEAN DEFAULT true,
  "enable_hr_module" BOOLEAN DEFAULT true,
  "enable_assets_module" BOOLEAN DEFAULT true,
  "enable_services_module" BOOLEAN DEFAULT true,
  "dep_default_method" TEXT DEFAULT 'Straight-Line',
  "dep_default_rate_percent" NUMERIC DEFAULT 20,
  "dep_use_rate_override" BOOLEAN DEFAULT false,
  "dep_posting_mode" TEXT DEFAULT 'Accumulated',
  "dep_factory_expense_account_id" TEXT,
  "dep_factory_expense_account_name" TEXT,
  "dep_admin_expense_account_id" TEXT,
  "dep_admin_expense_account_name" TEXT,
  "dep_accumulated_machinery_account_id" TEXT,
  "dep_accumulated_machinery_account_name" TEXT,
  "dep_accumulated_office_account_id" TEXT,
  "dep_accumulated_office_account_name" TEXT,
  "dep_accumulated_vehicle_account_id" TEXT,
  "dep_accumulated_vehicle_account_name" TEXT,
  "asset_categories" JSONB,
  "compliance_event_types" JSONB,
  "password_expiry_days" INTEGER DEFAULT 0,
  "quotation_prefix" TEXT DEFAULT 'QT',
  "quotation_suffix" TEXT DEFAULT '',
  "quotation_next_number" INTEGER DEFAULT 1,
  "quotation_validity_days" INTEGER DEFAULT 30,
  "quotation_template" TEXT DEFAULT 'modern',
  "quotation_accent_color" TEXT DEFAULT '#6366f1',
  "quotation_font" TEXT DEFAULT 'inter',
  "quotation_show_logo" BOOLEAN DEFAULT true,
  "quotation_show_vat" BOOLEAN DEFAULT true,
  "quotation_show_item_codes" BOOLEAN DEFAULT true,
  "quotation_show_unit_price" BOOLEAN DEFAULT true,
  "quotation_default_notes" TEXT DEFAULT '',
  "quotation_default_terms" TEXT DEFAULT '',
  "quotation_salutation" TEXT DEFAULT '',
  "quotation_paper_size" TEXT DEFAULT 'A4',
  "quotation_orientation" TEXT DEFAULT 'portrait',
  "gl_cash_account_id" TEXT,
  "gl_cash_account_name" TEXT,
  "gl_bank_account_id" TEXT,
  "gl_bank_account_name" TEXT,
  "gl_accounts_receivable_id" TEXT,
  "gl_accounts_receivable_name" TEXT,
  "gl_accounts_payable_id" TEXT,
  "gl_accounts_payable_name" TEXT,
  "gl_vat_payable_id" TEXT,
  "gl_vat_payable_name" TEXT,
  "gl_sales_return_account_id" TEXT,
  "gl_sales_return_account_name" TEXT,
  "gl_purchase_return_account_id" TEXT,
  "gl_purchase_return_account_name" TEXT,
  "gl_default_sales_account_id" TEXT,
  "gl_default_sales_account_name" TEXT,
  "gl_default_cogs_account_id" TEXT,
  "gl_default_cogs_account_name" TEXT,
  "gl_default_inventory_account_id" TEXT,
  "gl_default_inventory_account_name" TEXT,
  "gl_stock_variance_account_id" TEXT,
  "gl_stock_variance_account_name" TEXT,
  "gl_opening_equity_account_id" TEXT,
  "gl_opening_equity_account_name" TEXT,
  "gl_customer_ledger_group_id" TEXT,
  "gl_customer_ledger_group_name" TEXT,
  "gl_supplier_ledger_group_id" TEXT,
  "gl_supplier_ledger_group_name" TEXT,
  "gl_dual_ledger_group_id" TEXT,
  "gl_dual_ledger_group_name" TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

ALTER TABLE "CompanySettings" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_CompanySettings" ON "CompanySettings" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_CompanySettings" ON "CompanySettings" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_CompanySettings" ON "CompanySettings" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_CompanySettings" ON "CompanySettings" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

CREATE TABLE IF NOT EXISTS "DepreciationSchedule" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID,
  "asset_id" TEXT NOT NULL,
  "asset_name" TEXT,
  "asset_code" TEXT,
  "schedule_date" TIMESTAMP WITH TIME ZONE,
  "calculated_depreciation_amount" NUMERIC DEFAULT 0,
  "is_posted" BOOLEAN DEFAULT false,
  "posted_by" TEXT,
  "posted_date" TIMESTAMP WITH TIME ZONE,
  "period_label" TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

ALTER TABLE "DepreciationSchedule" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_DepreciationSchedule" ON "DepreciationSchedule" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_DepreciationSchedule" ON "DepreciationSchedule" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_DepreciationSchedule" ON "DepreciationSchedule" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_DepreciationSchedule" ON "DepreciationSchedule" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

CREATE TABLE IF NOT EXISTS "DiscountScheme" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID,
  "scheme_name" TEXT NOT NULL,
  "discount_type" TEXT NOT NULL DEFAULT 'Percentage',
  "discount_value" NUMERIC NOT NULL DEFAULT 0,
  "applies_to" TEXT DEFAULT 'All Items',
  "item_id" TEXT,
  "item_name" TEXT,
  "category_id" TEXT,
  "category_name" TEXT,
  "valid_from" TIMESTAMP WITH TIME ZONE,
  "valid_until" TIMESTAMP WITH TIME ZONE,
  "minimum_quantity" NUMERIC DEFAULT 0,
  "minimum_amount" NUMERIC DEFAULT 0,
  "is_active" BOOLEAN DEFAULT true,
  "notes" TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

ALTER TABLE "DiscountScheme" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_DiscountScheme" ON "DiscountScheme" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_DiscountScheme" ON "DiscountScheme" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_DiscountScheme" ON "DiscountScheme" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_DiscountScheme" ON "DiscountScheme" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

CREATE TABLE IF NOT EXISTS "Employee" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID,
  "employee_code" TEXT,
  "full_name" TEXT NOT NULL,
  "date_of_birth" TIMESTAMP WITH TIME ZONE,
  "national_id_number" TEXT,
  "department" TEXT,
  "designation" TEXT,
  "employment_status" TEXT DEFAULT 'Probation',
  "joining_date" TIMESTAMP WITH TIME ZONE,
  "exit_date" TIMESTAMP WITH TIME ZONE,
  "email" TEXT,
  "phone" TEXT,
  "address" TEXT,
  "bank_name" TEXT,
  "bank_account_number" TEXT,
  "base_salary" NUMERIC DEFAULT 0,
  "house_rent_allowance" NUMERIC DEFAULT 0,
  "transport_allowance" NUMERIC DEFAULT 0,
  "pf_deduction_percentage" NUMERIC DEFAULT 10,
  "tds_tax_percentage" NUMERIC DEFAULT 1,
  "annual_leave_balance" NUMERIC DEFAULT 0,
  "sick_leave_balance" NUMERIC DEFAULT 0,
  "profile_image_url" TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

ALTER TABLE "Employee" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_Employee" ON "Employee" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_Employee" ON "Employee" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_Employee" ON "Employee" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_Employee" ON "Employee" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

CREATE TABLE IF NOT EXISTS "FinancialVoucher" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID,
  "voucher_number" TEXT,
  "voucher_type" TEXT NOT NULL DEFAULT 'Receipt',
  "voucher_date" TIMESTAMP WITH TIME ZONE,
  "contact_id" TEXT,
  "contact_name" TEXT,
  "total_amount" NUMERIC DEFAULT 0,
  "payment_mode" TEXT DEFAULT 'Cash',
  "reference_no" TEXT,
  "status" TEXT DEFAULT 'Draft',
  "narration" TEXT,
  "entries" JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

ALTER TABLE "FinancialVoucher" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_FinancialVoucher" ON "FinancialVoucher" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_FinancialVoucher" ON "FinancialVoucher" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_FinancialVoucher" ON "FinancialVoucher" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_FinancialVoucher" ON "FinancialVoucher" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

CREATE TABLE IF NOT EXISTS "FinancialVoucherDeleteLog" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID,
  "voucher_id" TEXT,
  "voucher_number" TEXT NOT NULL,
  "voucher_type" TEXT,
  "voucher_date" TEXT,
  "total_amount" NUMERIC DEFAULT 0,
  "contact_name" TEXT,
  "action_type" TEXT NOT NULL DEFAULT 'Delete',
  "reversal_voucher_number" TEXT,
  "performed_by" TEXT NOT NULL,
  "reason" TEXT,
  "voucher_snapshot" JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

ALTER TABLE "FinancialVoucherDeleteLog" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_FinancialVoucherDeleteLog" ON "FinancialVoucherDeleteLog" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_FinancialVoucherDeleteLog" ON "FinancialVoucherDeleteLog" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_FinancialVoucherDeleteLog" ON "FinancialVoucherDeleteLog" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_FinancialVoucherDeleteLog" ON "FinancialVoucherDeleteLog" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

CREATE TABLE IF NOT EXISTS "FixedAsset" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID,
  "asset_code" TEXT,
  "asset_name" TEXT NOT NULL,
  "category" TEXT,
  "purchase_date" TIMESTAMP WITH TIME ZONE,
  "gross_purchase_value" NUMERIC DEFAULT 0,
  "salvage_value" NUMERIC DEFAULT 0,
  "useful_life_months" INTEGER DEFAULT 60,
  "depreciation_method" TEXT DEFAULT 'Straight-Line',
  "accumulated_depreciation" NUMERIC DEFAULT 0,
  "net_book_value" NUMERIC DEFAULT 0,
  "parent_asset_id" TEXT,
  "status" TEXT DEFAULT 'Active',
  "location" TEXT,
  "assigned_to" TEXT,
  "notes" TEXT,
  "document_urls" JSONB,
  "asset_ledger_id" TEXT,
  "asset_ledger_name" TEXT,
  "accumulated_dep_ledger_id" TEXT,
  "accumulated_dep_ledger_name" TEXT,
  "dep_expense_ledger_id" TEXT,
  "dep_expense_ledger_name" TEXT,
  "gl_posted" BOOLEAN DEFAULT false,
  "payment_method_type" TEXT DEFAULT 'cash_bank',
  "payment_account_id" TEXT,
  "payment_account_name" TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

ALTER TABLE "FixedAsset" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_FixedAsset" ON "FixedAsset" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_FixedAsset" ON "FixedAsset" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_FixedAsset" ON "FixedAsset" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_FixedAsset" ON "FixedAsset" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

CREATE TABLE IF NOT EXISTS "FixedAssetDeleteLog" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID,
  "asset_id" TEXT NOT NULL,
  "asset_code" TEXT,
  "asset_name" TEXT NOT NULL,
  "category" TEXT,
  "gross_purchase_value" NUMERIC DEFAULT 0,
  "net_book_value" NUMERIC DEFAULT 0,
  "status_before_delete" TEXT,
  "deleted_by" TEXT NOT NULL,
  "deleted_at" TIMESTAMP WITH TIME ZONE,
  "reason" TEXT,
  "asset_snapshot" JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

ALTER TABLE "FixedAssetDeleteLog" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_FixedAssetDeleteLog" ON "FixedAssetDeleteLog" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_FixedAssetDeleteLog" ON "FixedAssetDeleteLog" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_FixedAssetDeleteLog" ON "FixedAssetDeleteLog" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_FixedAssetDeleteLog" ON "FixedAssetDeleteLog" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

CREATE TABLE IF NOT EXISTS "GeneralLedgerJournal" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID,
  "entry_date" TIMESTAMP WITH TIME ZONE NOT NULL,
  "description" TEXT NOT NULL,
  "reference_module" TEXT NOT NULL DEFAULT 'General',
  "source_document_id" TEXT,
  "source_document_type" TEXT,
  "status" TEXT DEFAULT 'Draft',
  "total_debit" NUMERIC DEFAULT 0,
  "total_credit" NUMERIC DEFAULT 0,
  "is_balanced" BOOLEAN DEFAULT false,
  "posted_by" TEXT,
  "notes" TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

ALTER TABLE "GeneralLedgerJournal" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_GeneralLedgerJournal" ON "GeneralLedgerJournal" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_GeneralLedgerJournal" ON "GeneralLedgerJournal" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_GeneralLedgerJournal" ON "GeneralLedgerJournal" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_GeneralLedgerJournal" ON "GeneralLedgerJournal" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

CREATE TABLE IF NOT EXISTS "GeneralLedgerLine" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID,
  "journal_id" TEXT NOT NULL,
  "account_id" TEXT NOT NULL,
  "account_code" TEXT,
  "account_name" TEXT,
  "account_type" TEXT,
  "debit_amount" NUMERIC NOT NULL DEFAULT 0,
  "credit_amount" NUMERIC NOT NULL DEFAULT 0,
  "description" TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

ALTER TABLE "GeneralLedgerLine" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_GeneralLedgerLine" ON "GeneralLedgerLine" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_GeneralLedgerLine" ON "GeneralLedgerLine" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_GeneralLedgerLine" ON "GeneralLedgerLine" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_GeneralLedgerLine" ON "GeneralLedgerLine" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

CREATE TABLE IF NOT EXISTS "Item" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID,
  "item_code" TEXT,
  "item_name" TEXT NOT NULL,
  "category_id" TEXT,
  "category_name" TEXT,
  "item_type" TEXT DEFAULT 'Product',
  "costing_method" TEXT DEFAULT 'WAC',
  "unit_of_measure" TEXT DEFAULT 'PCS',
  "purchase_uom" TEXT,
  "sales_uom" TEXT,
  "selling_price" NUMERIC DEFAULT 0,
  "purchase_price" NUMERIC DEFAULT 0,
  "weighted_average_cost" NUMERIC DEFAULT 0,
  "current_unit_cost" NUMERIC DEFAULT 0,
  "total_asset_value" NUMERIC DEFAULT 0,
  "quantity_on_hand" NUMERIC DEFAULT 0,
  "quantity_reserved" NUMERIC DEFAULT 0,
  "reorder_level" NUMERIC DEFAULT 0,
  "purchase_account_id" TEXT,
  "purchase_account_name" TEXT,
  "sales_account_id" TEXT,
  "sales_account_name" TEXT,
  "inventory_account_id" TEXT,
  "inventory_account_name" TEXT,
  "discount_scheme_id" TEXT,
  "discount_scheme_name" TEXT,
  "is_active" BOOLEAN DEFAULT true,
  "is_vat_applicable" BOOLEAN DEFAULT false,
  "description" TEXT,
  "image_url" TEXT,
  "barcode" TEXT,
  "hs_code" TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

ALTER TABLE "Item" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_Item" ON "Item" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_Item" ON "Item" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_Item" ON "Item" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_Item" ON "Item" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

CREATE TABLE IF NOT EXISTS "ItemCategory" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID,
  "category_name" TEXT NOT NULL,
  "category_code" TEXT,
  "description" TEXT,
  "parent_category_id" TEXT,
  "purchase_account_id" TEXT,
  "purchase_account_name" TEXT,
  "sales_account_id" TEXT,
  "sales_account_name" TEXT,
  "discount_scheme_id" TEXT,
  "discount_scheme_name" TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

ALTER TABLE "ItemCategory" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_ItemCategory" ON "ItemCategory" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_ItemCategory" ON "ItemCategory" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_ItemCategory" ON "ItemCategory" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_ItemCategory" ON "ItemCategory" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

CREATE TABLE IF NOT EXISTS "ItemDeleteLog" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID,
  "item_id" TEXT,
  "item_code" TEXT,
  "item_name" TEXT NOT NULL,
  "item_type" TEXT,
  "category_name" TEXT,
  "selling_price" NUMERIC DEFAULT 0,
  "quantity_on_hand" NUMERIC DEFAULT 0,
  "hs_code" TEXT,
  "deleted_by" TEXT NOT NULL,
  "deleted_count" INTEGER DEFAULT 1,
  "notes" TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

ALTER TABLE "ItemDeleteLog" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_ItemDeleteLog" ON "ItemDeleteLog" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_ItemDeleteLog" ON "ItemDeleteLog" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_ItemDeleteLog" ON "ItemDeleteLog" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_ItemDeleteLog" ON "ItemDeleteLog" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

CREATE TABLE IF NOT EXISTS "ItemImportLog" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID,
  "file_name" TEXT NOT NULL,
  "imported_by" TEXT NOT NULL,
  "import_date" TIMESTAMP WITH TIME ZONE,
  "total_rows" INTEGER DEFAULT 0,
  "items_created" INTEGER DEFAULT 0,
  "items_updated" INTEGER DEFAULT 0,
  "items_skipped" INTEGER DEFAULT 0,
  "items_failed" INTEGER DEFAULT 0,
  "status" TEXT DEFAULT 'Success',
  "errors" JSONB,
  "notes" TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

ALTER TABLE "ItemImportLog" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_ItemImportLog" ON "ItemImportLog" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_ItemImportLog" ON "ItemImportLog" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_ItemImportLog" ON "ItemImportLog" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_ItemImportLog" ON "ItemImportLog" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

CREATE TABLE IF NOT EXISTS "ManufacturingOrder" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID,
  "mo_number" TEXT,
  "product_name" TEXT NOT NULL,
  "product_item_id" TEXT,
  "bom_description" TEXT,
  "planned_quantity" NUMERIC DEFAULT 1,
  "actual_yield_quantity" NUMERIC DEFAULT 0,
  "expected_yield_percent" NUMERIC DEFAULT 100,
  "status" TEXT DEFAULT 'Draft',
  "start_date" TIMESTAMP WITH TIME ZONE,
  "completion_date" TIMESTAMP WITH TIME ZONE,
  "total_material_cost" NUMERIC DEFAULT 0,
  "total_overhead_cost" NUMERIC DEFAULT 0,
  "final_unit_cost" NUMERIC DEFAULT 0,
  "batch_number" TEXT,
  "notes" TEXT,
  "bom_components" JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

ALTER TABLE "ManufacturingOrder" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_ManufacturingOrder" ON "ManufacturingOrder" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_ManufacturingOrder" ON "ManufacturingOrder" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_ManufacturingOrder" ON "ManufacturingOrder" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_ManufacturingOrder" ON "ManufacturingOrder" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

CREATE TABLE IF NOT EXISTS "OpeningBalanceLog" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID,
  "account_id" TEXT NOT NULL,
  "account_code" TEXT NOT NULL,
  "account_name" TEXT NOT NULL,
  "account_group" TEXT,
  "opening_date" TIMESTAMP WITH TIME ZONE,
  "previous_balance" NUMERIC DEFAULT 0,
  "new_balance" NUMERIC DEFAULT 0,
  "balance_type" TEXT,
  "changed_by" TEXT,
  "change_reason" TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

ALTER TABLE "OpeningBalanceLog" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_OpeningBalanceLog" ON "OpeningBalanceLog" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_OpeningBalanceLog" ON "OpeningBalanceLog" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_OpeningBalanceLog" ON "OpeningBalanceLog" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_OpeningBalanceLog" ON "OpeningBalanceLog" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

CREATE TABLE IF NOT EXISTS "PartnerDeleteLog" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID,
  "partner_id" TEXT,
  "partner_name" TEXT NOT NULL,
  "partner_type" TEXT NOT NULL,
  "partner_code" TEXT,
  "tax_id_number" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "deleted_by" TEXT NOT NULL,
  "action_type" TEXT DEFAULT 'Single Delete',
  "log_payload" TEXT,
  "partner_snapshot" JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

ALTER TABLE "PartnerDeleteLog" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_PartnerDeleteLog" ON "PartnerDeleteLog" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_PartnerDeleteLog" ON "PartnerDeleteLog" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_PartnerDeleteLog" ON "PartnerDeleteLog" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_PartnerDeleteLog" ON "PartnerDeleteLog" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

CREATE TABLE IF NOT EXISTS "PartnerImportLog" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID,
  "file_name" TEXT NOT NULL,
  "imported_by" TEXT NOT NULL,
  "import_type" TEXT NOT NULL,
  "import_date" TIMESTAMP WITH TIME ZONE,
  "total_rows" INTEGER DEFAULT 0,
  "created_count" INTEGER DEFAULT 0,
  "updated_count" INTEGER DEFAULT 0,
  "failed_count" INTEGER DEFAULT 0,
  "ledgers_generated" INTEGER DEFAULT 0,
  "journals_posted" INTEGER DEFAULT 0,
  "status" TEXT DEFAULT 'Success',
  "errors" JSONB,
  "summary_message" TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

ALTER TABLE "PartnerImportLog" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_PartnerImportLog" ON "PartnerImportLog" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_PartnerImportLog" ON "PartnerImportLog" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_PartnerImportLog" ON "PartnerImportLog" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_PartnerImportLog" ON "PartnerImportLog" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

CREATE TABLE IF NOT EXISTS "PayrollRun" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID,
  "run_reference" TEXT,
  "period_month" INTEGER,
  "period_year" INTEGER,
  "period_label" TEXT NOT NULL,
  "status" TEXT DEFAULT 'Draft',
  "total_gross" NUMERIC DEFAULT 0,
  "total_pf" NUMERIC DEFAULT 0,
  "total_tds" NUMERIC DEFAULT 0,
  "total_net" NUMERIC DEFAULT 0,
  "employee_count" INTEGER DEFAULT 0,
  "payslips" JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

ALTER TABLE "PayrollRun" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_PayrollRun" ON "PayrollRun" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_PayrollRun" ON "PayrollRun" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_PayrollRun" ON "PayrollRun" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_PayrollRun" ON "PayrollRun" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

CREATE TABLE IF NOT EXISTS "POSSale" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID,
  "sale_number" TEXT,
  "sale_date" TIMESTAMP WITH TIME ZONE,
  "customer_name" TEXT DEFAULT 'Walk-in Customer',
  "customer_id" TEXT,
  "payment_method" TEXT DEFAULT 'Cash',
  "subtotal" NUMERIC DEFAULT 0,
  "discount_amount" NUMERIC DEFAULT 0,
  "vat_amount" NUMERIC DEFAULT 0,
  "grand_total" NUMERIC DEFAULT 0,
  "amount_tendered" NUMERIC DEFAULT 0,
  "change_amount" NUMERIC DEFAULT 0,
  "status" TEXT DEFAULT 'Completed',
  "notes" TEXT,
  "line_items" JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

ALTER TABLE "POSSale" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_POSSale" ON "POSSale" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_POSSale" ON "POSSale" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_POSSale" ON "POSSale" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_POSSale" ON "POSSale" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

CREATE TABLE IF NOT EXISTS "PurchaseInvoice" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID,
  "invoice_number" TEXT,
  "vendor_invoice_no" TEXT,
  "po_reference_id" TEXT,
  "po_reference_number" TEXT,
  "vendor_id" TEXT,
  "vendor_name" TEXT NOT NULL,
  "invoice_date" TIMESTAMP WITH TIME ZONE,
  "due_date" TIMESTAMP WITH TIME ZONE,
  "status" TEXT DEFAULT 'Draft',
  "payment_status" TEXT DEFAULT 'Unpaid',
  "subtotal" NUMERIC DEFAULT 0,
  "vat_amount" NUMERIC DEFAULT 0,
  "landed_cost_total" NUMERIC DEFAULT 0,
  "grand_total" NUMERIC DEFAULT 0,
  "notes" TEXT,
  "line_items" JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

ALTER TABLE "PurchaseInvoice" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_PurchaseInvoice" ON "PurchaseInvoice" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_PurchaseInvoice" ON "PurchaseInvoice" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_PurchaseInvoice" ON "PurchaseInvoice" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_PurchaseInvoice" ON "PurchaseInvoice" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

CREATE TABLE IF NOT EXISTS "PurchaseOrder" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID,
  "po_number" TEXT,
  "vendor_id" TEXT,
  "vendor_name" TEXT NOT NULL,
  "status" TEXT DEFAULT 'Draft',
  "order_date" TIMESTAMP WITH TIME ZONE,
  "expected_delivery_date" TIMESTAMP WITH TIME ZONE,
  "subtotal" NUMERIC DEFAULT 0,
  "vat_amount" NUMERIC DEFAULT 0,
  "total_amount" NUMERIC DEFAULT 0,
  "approved_by" TEXT,
  "approved_date" TIMESTAMP WITH TIME ZONE,
  "notes" TEXT,
  "line_items" JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

ALTER TABLE "PurchaseOrder" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_PurchaseOrder" ON "PurchaseOrder" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_PurchaseOrder" ON "PurchaseOrder" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_PurchaseOrder" ON "PurchaseOrder" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_PurchaseOrder" ON "PurchaseOrder" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

CREATE TABLE IF NOT EXISTS "PurchaseReturn" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID,
  "return_number" TEXT,
  "purchase_invoice_id" TEXT,
  "purchase_invoice_number" TEXT,
  "vendor_id" TEXT,
  "vendor_name" TEXT NOT NULL,
  "return_date" TIMESTAMP WITH TIME ZONE,
  "reason" TEXT,
  "status" TEXT DEFAULT 'Draft',
  "subtotal" NUMERIC DEFAULT 0,
  "vat_amount" NUMERIC DEFAULT 0,
  "grand_total" NUMERIC DEFAULT 0,
  "notes" TEXT,
  "line_items" JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

ALTER TABLE "PurchaseReturn" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_PurchaseReturn" ON "PurchaseReturn" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_PurchaseReturn" ON "PurchaseReturn" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_PurchaseReturn" ON "PurchaseReturn" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_PurchaseReturn" ON "PurchaseReturn" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

CREATE TABLE IF NOT EXISTS "Quotation" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID,
  "quotation_number" TEXT,
  "customer_id" TEXT,
  "customer_name" TEXT NOT NULL,
  "customer_email" TEXT,
  "customer_phone" TEXT,
  "customer_address" TEXT,
  "quotation_date" TIMESTAMP WITH TIME ZONE NOT NULL,
  "valid_until" TIMESTAMP WITH TIME ZONE,
  "status" TEXT DEFAULT 'Draft',
  "goods_subtotal" NUMERIC DEFAULT 0,
  "discount_amount" NUMERIC DEFAULT 0,
  "total_tax_amount" NUMERIC DEFAULT 0,
  "grand_total" NUMERIC DEFAULT 0,
  "notes" TEXT,
  "internal_notes" TEXT,
  "terms_and_conditions" TEXT,
  "converted_to_order_id" TEXT,
  "converted_to_invoice_id" TEXT,
  "line_items" JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

ALTER TABLE "Quotation" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_Quotation" ON "Quotation" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_Quotation" ON "Quotation" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_Quotation" ON "Quotation" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_Quotation" ON "Quotation" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

CREATE TABLE IF NOT EXISTS "SalesInvoice" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID,
  "invoice_number" TEXT,
  "customer_id" TEXT,
  "customer_name" TEXT NOT NULL,
  "sales_order_id" TEXT,
  "invoice_date" TIMESTAMP WITH TIME ZONE,
  "due_date" TIMESTAMP WITH TIME ZONE,
  "status" TEXT DEFAULT 'Draft',
  "payment_status" TEXT DEFAULT 'Unpaid',
  "goods_subtotal" NUMERIC DEFAULT 0,
  "sundry_charges_total" NUMERIC DEFAULT 0,
  "total_tax_amount" NUMERIC DEFAULT 0,
  "grand_total" NUMERIC DEFAULT 0,
  "notes" TEXT,
  "cancellation_reason" TEXT,
  "cancelled_date" TIMESTAMP WITH TIME ZONE,
  "rejection_reason" TEXT,
  "rejected_date" TIMESTAMP WITH TIME ZONE,
  "line_items" JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

ALTER TABLE "SalesInvoice" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_SalesInvoice" ON "SalesInvoice" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_SalesInvoice" ON "SalesInvoice" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_SalesInvoice" ON "SalesInvoice" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_SalesInvoice" ON "SalesInvoice" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

CREATE TABLE IF NOT EXISTS "SalesOrder" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID,
  "order_number" TEXT,
  "customer_id" TEXT,
  "customer_name" TEXT NOT NULL,
  "order_date" TIMESTAMP WITH TIME ZONE,
  "expected_delivery_date" TIMESTAMP WITH TIME ZONE,
  "fulfillment_status" TEXT DEFAULT 'Draft',
  "subtotal" NUMERIC DEFAULT 0,
  "vat_amount" NUMERIC DEFAULT 0,
  "total_amount" NUMERIC DEFAULT 0,
  "notes" TEXT,
  "line_items" JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

ALTER TABLE "SalesOrder" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_SalesOrder" ON "SalesOrder" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_SalesOrder" ON "SalesOrder" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_SalesOrder" ON "SalesOrder" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_SalesOrder" ON "SalesOrder" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

CREATE TABLE IF NOT EXISTS "SalesReturn" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID,
  "return_number" TEXT,
  "sales_invoice_id" TEXT,
  "sales_invoice_number" TEXT,
  "pos_sale_id" TEXT,
  "pos_sale_number" TEXT,
  "return_source" TEXT DEFAULT 'Sales Invoice',
  "refund_method" TEXT DEFAULT 'Cash',
  "customer_id" TEXT,
  "customer_name" TEXT NOT NULL,
  "return_date" TIMESTAMP WITH TIME ZONE,
  "reason" TEXT,
  "status" TEXT DEFAULT 'Draft',
  "subtotal" NUMERIC DEFAULT 0,
  "vat_amount" NUMERIC DEFAULT 0,
  "grand_total" NUMERIC DEFAULT 0,
  "notes" TEXT,
  "line_items" JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

ALTER TABLE "SalesReturn" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_SalesReturn" ON "SalesReturn" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_SalesReturn" ON "SalesReturn" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_SalesReturn" ON "SalesReturn" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_SalesReturn" ON "SalesReturn" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

CREATE TABLE IF NOT EXISTS "ServiceContract" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID,
  "contract_reference" TEXT,
  "customer_id" TEXT,
  "customer_name" TEXT NOT NULL,
  "service_name" TEXT NOT NULL,
  "description" TEXT,
  "start_date" TIMESTAMP WITH TIME ZONE,
  "expiry_date" TIMESTAMP WITH TIME ZONE,
  "billing_frequency" TEXT DEFAULT 'Monthly',
  "billing_amount" NUMERIC DEFAULT 0,
  "next_billing_date" TIMESTAMP WITH TIME ZONE,
  "status" TEXT DEFAULT 'Draft',
  "billing_type" TEXT DEFAULT 'Bill in Arrears',
  "assigned_sales_rep" TEXT,
  "notes" TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

ALTER TABLE "ServiceContract" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_ServiceContract" ON "ServiceContract" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_ServiceContract" ON "ServiceContract" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_ServiceContract" ON "ServiceContract" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_ServiceContract" ON "ServiceContract" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

CREATE TABLE IF NOT EXISTS "StockAdjustment" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID,
  "adjustment_number" TEXT,
  "adjustment_date" TIMESTAMP WITH TIME ZONE,
  "adjustment_type" TEXT NOT NULL DEFAULT 'Increase',
  "reason" TEXT DEFAULT 'Physical Count Variance',
  "status" TEXT DEFAULT 'Draft',
  "total_cost_impact" NUMERIC DEFAULT 0,
  "notes" TEXT,
  "line_items" JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

ALTER TABLE "StockAdjustment" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_StockAdjustment" ON "StockAdjustment" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_StockAdjustment" ON "StockAdjustment" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_StockAdjustment" ON "StockAdjustment" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_StockAdjustment" ON "StockAdjustment" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

CREATE TABLE IF NOT EXISTS "UnitOfMeasure" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID,
  "uom_code" TEXT NOT NULL,
  "uom_name" TEXT NOT NULL,
  "uom_type" TEXT DEFAULT 'Quantity',
  "is_base_unit" BOOLEAN DEFAULT false,
  "base_unit_code" TEXT,
  "conversion_factor" NUMERIC DEFAULT 1,
  "is_active" BOOLEAN DEFAULT true,
  "description" TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

ALTER TABLE "UnitOfMeasure" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_UnitOfMeasure" ON "UnitOfMeasure" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_UnitOfMeasure" ON "UnitOfMeasure" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_UnitOfMeasure" ON "UnitOfMeasure" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_UnitOfMeasure" ON "UnitOfMeasure" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

CREATE TABLE IF NOT EXISTS "User" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "role" TEXT NOT NULL,
  "must_change_password" BOOLEAN DEFAULT false,
  "temp_password" TEXT,
  "password_last_changed" TIMESTAMP WITH TIME ZONE,
  "password_expiry_days" INTEGER,
  "full_name" TEXT,
  "avatar_url" TEXT,
  "phone_number" TEXT,
  "job_title" TEXT,
  "department" TEXT,
  "bio" TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all for authenticated users" ON "User" FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS "UserCompany" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "user_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "is_default" BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

ALTER TABLE "UserCompany" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all for authenticated users" ON "UserCompany" FOR ALL TO authenticated USING (true) WITH CHECK (true);


CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_AssetComplianceSchedule_updated_at
BEFORE UPDATE ON "AssetComplianceSchedule"
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_BankAccount_updated_at
BEFORE UPDATE ON "BankAccount"
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_BusinessPartner_updated_at
BEFORE UPDATE ON "BusinessPartner"
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ChartOfAccount_updated_at
BEFORE UPDATE ON "ChartOfAccount"
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_Company_updated_at
BEFORE UPDATE ON "Company"
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_CompanySettings_updated_at
BEFORE UPDATE ON "CompanySettings"
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_DepreciationSchedule_updated_at
BEFORE UPDATE ON "DepreciationSchedule"
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_DiscountScheme_updated_at
BEFORE UPDATE ON "DiscountScheme"
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_Employee_updated_at
BEFORE UPDATE ON "Employee"
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_FinancialVoucher_updated_at
BEFORE UPDATE ON "FinancialVoucher"
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_FinancialVoucherDeleteLog_updated_at
BEFORE UPDATE ON "FinancialVoucherDeleteLog"
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_FixedAsset_updated_at
BEFORE UPDATE ON "FixedAsset"
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_FixedAssetDeleteLog_updated_at
BEFORE UPDATE ON "FixedAssetDeleteLog"
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_GeneralLedgerJournal_updated_at
BEFORE UPDATE ON "GeneralLedgerJournal"
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_GeneralLedgerLine_updated_at
BEFORE UPDATE ON "GeneralLedgerLine"
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_Item_updated_at
BEFORE UPDATE ON "Item"
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ItemCategory_updated_at
BEFORE UPDATE ON "ItemCategory"
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ItemDeleteLog_updated_at
BEFORE UPDATE ON "ItemDeleteLog"
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ItemImportLog_updated_at
BEFORE UPDATE ON "ItemImportLog"
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ManufacturingOrder_updated_at
BEFORE UPDATE ON "ManufacturingOrder"
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_OpeningBalanceLog_updated_at
BEFORE UPDATE ON "OpeningBalanceLog"
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_PartnerDeleteLog_updated_at
BEFORE UPDATE ON "PartnerDeleteLog"
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_PartnerImportLog_updated_at
BEFORE UPDATE ON "PartnerImportLog"
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_PayrollRun_updated_at
BEFORE UPDATE ON "PayrollRun"
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_POSSale_updated_at
BEFORE UPDATE ON "POSSale"
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_PurchaseInvoice_updated_at
BEFORE UPDATE ON "PurchaseInvoice"
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_PurchaseOrder_updated_at
BEFORE UPDATE ON "PurchaseOrder"
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_PurchaseReturn_updated_at
BEFORE UPDATE ON "PurchaseReturn"
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_Quotation_updated_at
BEFORE UPDATE ON "Quotation"
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_SalesInvoice_updated_at
BEFORE UPDATE ON "SalesInvoice"
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_SalesOrder_updated_at
BEFORE UPDATE ON "SalesOrder"
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_SalesReturn_updated_at
BEFORE UPDATE ON "SalesReturn"
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ServiceContract_updated_at
BEFORE UPDATE ON "ServiceContract"
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_StockAdjustment_updated_at
BEFORE UPDATE ON "StockAdjustment"
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_UnitOfMeasure_updated_at
BEFORE UPDATE ON "UnitOfMeasure"
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_User_updated_at
BEFORE UPDATE ON "User"
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_UserCompany_updated_at
BEFORE UPDATE ON "UserCompany"
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE FUNCTION delete_company_data(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- We delete dependent records first to avoid foreign key violations (if any are enforced)
  
  -- Delete Logs
  DELETE FROM "FinancialVoucherDeleteLog" WHERE company_id = p_company_id;
  DELETE FROM "FixedAssetDeleteLog" WHERE company_id = p_company_id;
  DELETE FROM "ItemDeleteLog" WHERE company_id = p_company_id;
  DELETE FROM "PartnerDeleteLog" WHERE company_id = p_company_id;
  DELETE FROM "ItemImportLog" WHERE company_id = p_company_id;
  DELETE FROM "PartnerImportLog" WHERE company_id = p_company_id;
  DELETE FROM "OpeningBalanceLog" WHERE company_id = p_company_id;
  
  -- Delete Treasury / Vouchers
  DELETE FROM "FinancialVoucher" WHERE company_id = p_company_id;
  DELETE FROM "BankAccount" WHERE company_id = p_company_id;

  -- Delete Transactions
  DELETE FROM "POSSale" WHERE company_id = p_company_id;
  DELETE FROM "SalesReturn" WHERE company_id = p_company_id;
  DELETE FROM "SalesInvoice" WHERE company_id = p_company_id;
  DELETE FROM "SalesOrder" WHERE company_id = p_company_id;
  DELETE FROM "Quotation" WHERE company_id = p_company_id;

  DELETE FROM "PurchaseReturn" WHERE company_id = p_company_id;
  DELETE FROM "PurchaseInvoice" WHERE company_id = p_company_id;
  DELETE FROM "PurchaseOrder" WHERE company_id = p_company_id;

  -- Delete Inventory / Manufacturing
  DELETE FROM "StockAdjustment" WHERE company_id = p_company_id;
  DELETE FROM "ManufacturingOrder" WHERE company_id = p_company_id;
  
  -- Delete Items
  DELETE FROM "DiscountScheme" WHERE company_id = p_company_id;
  DELETE FROM "Item" WHERE company_id = p_company_id;
  DELETE FROM "ItemCategory" WHERE company_id = p_company_id;
  DELETE FROM "UnitOfMeasure" WHERE company_id = p_company_id;

  -- Delete Partners
  DELETE FROM "BusinessPartner" WHERE company_id = p_company_id;

  -- Delete HR & Services
  DELETE FROM "PayrollRun" WHERE company_id = p_company_id;
  DELETE FROM "Employee" WHERE company_id = p_company_id;
  DELETE FROM "ServiceContract" WHERE company_id = p_company_id;

  -- Delete Fixed Assets
  DELETE FROM "AssetComplianceSchedule" WHERE company_id = p_company_id;
  DELETE FROM "DepreciationSchedule" WHERE company_id = p_company_id;
  DELETE FROM "FixedAsset" WHERE company_id = p_company_id;

  -- Delete Ledgers (GL Lines and Journals)
  DELETE FROM "GeneralLedgerLine" WHERE company_id = p_company_id;
  DELETE FROM "GeneralLedgerJournal" WHERE company_id = p_company_id;
  
  -- Delete Chart of Accounts (excluding defaults and 'Difference in Opening Balance' ledger)
  DELETE FROM "ChartOfAccount"
  WHERE company_id = p_company_id
    AND is_system_account = false
    AND account_name != 'Difference in Opening Balance';

END;
$$;
CREATE OR REPLACE FUNCTION delete_company_data(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete all operational and transactional data first
  DELETE FROM "FinancialVoucherDeleteLog" WHERE company_id = p_company_id;
  DELETE FROM "FixedAssetDeleteLog" WHERE company_id = p_company_id;
  DELETE FROM "ItemDeleteLog" WHERE company_id = p_company_id;
  DELETE FROM "PartnerDeleteLog" WHERE company_id = p_company_id;
  DELETE FROM "ItemImportLog" WHERE company_id = p_company_id;
  DELETE FROM "PartnerImportLog" WHERE company_id = p_company_id;
  DELETE FROM "OpeningBalanceLog" WHERE company_id = p_company_id;
  
  DELETE FROM "FinancialVoucher" WHERE company_id = p_company_id;
  DELETE FROM "BankAccount" WHERE company_id = p_company_id;
  DELETE FROM "POSSale" WHERE company_id = p_company_id;
  DELETE FROM "SalesReturn" WHERE company_id = p_company_id;
  DELETE FROM "SalesInvoice" WHERE company_id = p_company_id;
  DELETE FROM "SalesOrder" WHERE company_id = p_company_id;
  DELETE FROM "Quotation" WHERE company_id = p_company_id;
  DELETE FROM "PurchaseReturn" WHERE company_id = p_company_id;
  DELETE FROM "PurchaseInvoice" WHERE company_id = p_company_id;
  DELETE FROM "PurchaseOrder" WHERE company_id = p_company_id;

  DELETE FROM "StockAdjustment" WHERE company_id = p_company_id;
  DELETE FROM "ManufacturingOrder" WHERE company_id = p_company_id;
  
  DELETE FROM "DiscountScheme" WHERE company_id = p_company_id;
  DELETE FROM "Item" WHERE company_id = p_company_id;
  DELETE FROM "ItemCategory" WHERE company_id = p_company_id;
  DELETE FROM "UnitOfMeasure" WHERE company_id = p_company_id;

  DELETE FROM "BusinessPartner" WHERE company_id = p_company_id;
  
  DELETE FROM "PayrollRun" WHERE company_id = p_company_id;
  DELETE FROM "Employee" WHERE company_id = p_company_id;
  DELETE FROM "ServiceContract" WHERE company_id = p_company_id;

  DELETE FROM "AssetComplianceSchedule" WHERE company_id = p_company_id;
  DELETE FROM "DepreciationSchedule" WHERE company_id = p_company_id;
  DELETE FROM "FixedAsset" WHERE company_id = p_company_id;

  DELETE FROM "GeneralLedgerLine" WHERE company_id = p_company_id;
  DELETE FROM "GeneralLedgerJournal" WHERE company_id = p_company_id;
  
  -- Delete all Chart of Accounts entries (NO EXCEPTIONS)
  DELETE FROM "ChartOfAccount" WHERE company_id = p_company_id;

  -- Delete Settings and User associations
  DELETE FROM "CompanySettings" WHERE company_id = p_company_id;
  DELETE FROM "UserCompany" WHERE company_id = p_company_id;
  
  -- Finally, delete the Company record itself
  DELETE FROM "Company" WHERE id = p_company_id;
END;
$$;
CREATE OR REPLACE FUNCTION delete_company_data(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete all operational and transactional data first
  DELETE FROM "FinancialVoucherDeleteLog" WHERE company_id::text = p_company_id::text;
  DELETE FROM "FixedAssetDeleteLog" WHERE company_id::text = p_company_id::text;
  DELETE FROM "ItemDeleteLog" WHERE company_id::text = p_company_id::text;
  DELETE FROM "PartnerDeleteLog" WHERE company_id::text = p_company_id::text;
  DELETE FROM "ItemImportLog" WHERE company_id::text = p_company_id::text;
  DELETE FROM "PartnerImportLog" WHERE company_id::text = p_company_id::text;
  DELETE FROM "OpeningBalanceLog" WHERE company_id::text = p_company_id::text;
  
  DELETE FROM "FinancialVoucher" WHERE company_id::text = p_company_id::text;
  DELETE FROM "BankAccount" WHERE company_id::text = p_company_id::text;
  DELETE FROM "POSSale" WHERE company_id::text = p_company_id::text;
  DELETE FROM "SalesReturn" WHERE company_id::text = p_company_id::text;
  DELETE FROM "SalesInvoice" WHERE company_id::text = p_company_id::text;
  DELETE FROM "SalesOrder" WHERE company_id::text = p_company_id::text;
  DELETE FROM "Quotation" WHERE company_id::text = p_company_id::text;
  DELETE FROM "PurchaseReturn" WHERE company_id::text = p_company_id::text;
  DELETE FROM "PurchaseInvoice" WHERE company_id::text = p_company_id::text;
  DELETE FROM "PurchaseOrder" WHERE company_id::text = p_company_id::text;

  DELETE FROM "StockAdjustment" WHERE company_id::text = p_company_id::text;
  DELETE FROM "ManufacturingOrder" WHERE company_id::text = p_company_id::text;
  
  DELETE FROM "DiscountScheme" WHERE company_id::text = p_company_id::text;
  DELETE FROM "Item" WHERE company_id::text = p_company_id::text;
  DELETE FROM "ItemCategory" WHERE company_id::text = p_company_id::text;
  DELETE FROM "UnitOfMeasure" WHERE company_id::text = p_company_id::text;

  DELETE FROM "BusinessPartner" WHERE company_id::text = p_company_id::text;
  
  DELETE FROM "PayrollRun" WHERE company_id::text = p_company_id::text;
  DELETE FROM "Employee" WHERE company_id::text = p_company_id::text;
  DELETE FROM "ServiceContract" WHERE company_id::text = p_company_id::text;

  DELETE FROM "AssetComplianceSchedule" WHERE company_id::text = p_company_id::text;
  DELETE FROM "DepreciationSchedule" WHERE company_id::text = p_company_id::text;
  DELETE FROM "FixedAsset" WHERE company_id::text = p_company_id::text;

  DELETE FROM "GeneralLedgerLine" WHERE company_id::text = p_company_id::text;
  DELETE FROM "GeneralLedgerJournal" WHERE company_id::text = p_company_id::text;
  
  -- Delete all Chart of Accounts entries (NO EXCEPTIONS)
  DELETE FROM "ChartOfAccount" WHERE company_id::text = p_company_id::text;

  -- Delete Settings and User associations
  DELETE FROM "CompanySettings" WHERE company_id::text = p_company_id::text;
  DELETE FROM "UserCompany" WHERE company_id::text = p_company_id::text;
  
  -- Finally, delete the Company record itself
  DELETE FROM "Company" WHERE id::text = p_company_id::text;
END;
$$;
