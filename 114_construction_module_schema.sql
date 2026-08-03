-- 114_construction_module_schema.sql
-- Migration for Construction Management Module Schema

SET search_path = public, pg_temp;

-- 1. Modify CompanySettings (Feature Toggle)
ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS enable_construction_module BOOLEAN DEFAULT false;

-- 2. DocumentSequence Table
CREATE TABLE IF NOT EXISTS "DocumentSequence" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  document_type TEXT NOT NULL,
  prefix TEXT DEFAULT '',
  suffix TEXT DEFAULT '',
  next_number INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT,
  CONSTRAINT uq_company_doc_type UNIQUE (company_id, document_type)
);

-- 3. ConstructionProject Table
CREATE TABLE IF NOT EXISTS "ConstructionProject" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  customer_id UUID REFERENCES "BusinessPartner"(id),
  project_name TEXT NOT NULL,
  site_address TEXT,
  estimated_budget NUMERIC DEFAULT 0,
  target_completion_date DATE,
  status TEXT DEFAULT 'Active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

-- 4. DeliveryChallan Table
CREATE TABLE IF NOT EXISTS "DeliveryChallan" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  project_id UUID REFERENCES "ConstructionProject"(id),
  godown_id UUID NOT NULL REFERENCES "Godown"(id),
  issue_date DATE NOT NULL,
  voucher_no TEXT NOT NULL,
  billing_status TEXT DEFAULT 'Unbilled',
  linked_invoice_id UUID REFERENCES "SalesInvoice"(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT,
  CONSTRAINT uq_challan_voucher_no UNIQUE (company_id, voucher_no)
);

-- 5. DeliveryChallanLine Table
CREATE TABLE IF NOT EXISTS "DeliveryChallanLine" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  challan_id UUID NOT NULL REFERENCES "DeliveryChallan"(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES "Item"(id),
  quantity NUMERIC DEFAULT 0,
  rate NUMERIC DEFAULT 0,
  billed_quantity NUMERIC DEFAULT 0,
  linked_invoice_line_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

-- Enable RLS
ALTER TABLE "DocumentSequence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConstructionProject" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeliveryChallan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeliveryChallanLine" ENABLE ROW LEVEL SECURITY;

-- Define RLS Policies for DocumentSequence
CREATE POLICY "select_DocumentSequence" ON "DocumentSequence" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_DocumentSequence" ON "DocumentSequence" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_DocumentSequence" ON "DocumentSequence" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_DocumentSequence" ON "DocumentSequence" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

-- Define RLS Policies for ConstructionProject
CREATE POLICY "select_ConstructionProject" ON "ConstructionProject" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_ConstructionProject" ON "ConstructionProject" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_ConstructionProject" ON "ConstructionProject" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_ConstructionProject" ON "ConstructionProject" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

-- Define RLS Policies for DeliveryChallan
CREATE POLICY "select_DeliveryChallan" ON "DeliveryChallan" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_DeliveryChallan" ON "DeliveryChallan" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_DeliveryChallan" ON "DeliveryChallan" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_DeliveryChallan" ON "DeliveryChallan" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

-- Define RLS Policies for DeliveryChallanLine
CREATE POLICY "select_DeliveryChallanLine" ON "DeliveryChallanLine" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_DeliveryChallanLine" ON "DeliveryChallanLine" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_DeliveryChallanLine" ON "DeliveryChallanLine" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_DeliveryChallanLine" ON "DeliveryChallanLine" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
