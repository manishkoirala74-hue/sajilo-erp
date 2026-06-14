-- Migration script: 033_communication_framework.sql

DROP TABLE IF EXISTS public."CommunicationOutbox" CASCADE;
DROP TABLE IF EXISTS public."CompanyCommunicationSetting" CASCADE;

CREATE TABLE IF NOT EXISTS public."CompanyCommunicationSetting" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID UNIQUE NOT NULL,
  email_smtp_host TEXT,
  email_smtp_port INTEGER DEFAULT 587,
  email_smtp_user TEXT,
  email_smtp_password TEXT,
  email_from_name TEXT,
  auth_method TEXT DEFAULT 'SMTP',
  google_refresh_token TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS public."CommunicationOutbox" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL,
  module TEXT NOT NULL,
  reference_id UUID NOT NULL,
  partner_id UUID,
  recipient_email TEXT,
  type TEXT NOT NULL CHECK (type IN ('EMAIL')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'SENT', 'FAILED')),
  retry_count INTEGER DEFAULT 0,
  error_log TEXT,
  payload JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for high-velocity scans
CREATE INDEX IF NOT EXISTS idx_comm_outbox_queue ON public."CommunicationOutbox" (status, retry_count) WHERE status = 'PENDING';

-- Migrate existing SMTP settings from CompanySettings
INSERT INTO public."CompanyCommunicationSetting" (
    company_id, 
    email_smtp_host, 
    email_smtp_port, 
    email_smtp_user, 
    email_smtp_password, 
    email_from_name,
    auth_method,
    google_refresh_token
)
SELECT 
    company_id, 
    email_smtp_host, 
    email_smtp_port, 
    email_smtp_user, 
    email_smtp_password, 
    email_from_name,
    'SMTP',
    NULL
FROM public."CompanySettings"
ON CONFLICT (company_id) DO UPDATE SET
    email_smtp_host = EXCLUDED.email_smtp_host,
    email_smtp_port = EXCLUDED.email_smtp_port,
    email_smtp_user = EXCLUDED.email_smtp_user,
    email_smtp_password = EXCLUDED.email_smtp_password,
    email_from_name = EXCLUDED.email_from_name;

-- Enable RLS
ALTER TABLE public."CompanyCommunicationSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CommunicationOutbox" ENABLE ROW LEVEL SECURITY;

-- Policies for CompanyCommunicationSetting (Admin only)
CREATE POLICY "select_CompanyCommunicationSetting" ON public."CompanyCommunicationSetting" FOR SELECT 
USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

CREATE POLICY "insert_CompanyCommunicationSetting" ON public."CompanyCommunicationSetting" FOR INSERT 
WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

CREATE POLICY "update_CompanyCommunicationSetting" ON public."CompanyCommunicationSetting" FOR UPDATE 
USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) 
WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

CREATE POLICY "delete_CompanyCommunicationSetting" ON public."CompanyCommunicationSetting" FOR DELETE 
USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

-- Policies for CommunicationOutbox (Read for all users in company, Insert for all, Update for admin/system)
CREATE POLICY "select_CommunicationOutbox" ON public."CommunicationOutbox" FOR SELECT 
USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

CREATE POLICY "insert_CommunicationOutbox" ON public."CommunicationOutbox" FOR INSERT 
WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

CREATE POLICY "update_CommunicationOutbox" ON public."CommunicationOutbox" FOR UPDATE 
USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) 
WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

CREATE POLICY "delete_CommunicationOutbox" ON public."CommunicationOutbox" FOR DELETE 
USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

-- Add Trigger for updated_at
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';
CREATE TRIGGER update_CompanyCommunicationSetting_updated_at
BEFORE UPDATE ON public."CompanyCommunicationSetting"
FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

CREATE TRIGGER update_CommunicationOutbox_updated_at
BEFORE UPDATE ON public."CommunicationOutbox"
FOR EACH ROW EXECUTE PROCEDURE update_modified_column();
