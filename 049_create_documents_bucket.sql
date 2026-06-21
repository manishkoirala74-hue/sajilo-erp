-- Migration script: 049_create_documents_bucket.sql

-- 1. Create the bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('erp_documents', 'erp_documents', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- 2. (Skipped: Supabase already has RLS enabled on storage.objects, and trying to alter it can cause permission issues depending on the role)

-- 3. Drop existing policies to be idempotent
DROP POLICY IF EXISTS "Company users can read their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Company users can insert their own documents" ON storage.objects;

-- 4. Create RLS Policies
-- Users can only SELECT files where the path starts with their company_id
CREATE POLICY "Company users can read their own documents"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'erp_documents' 
    AND (
      EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')
      OR (
        split_part(name, '/', 1) IN (
            SELECT company_id::text 
            FROM "UserCompany" 
            WHERE user_id = auth.uid()
        )
      )
    )
);

-- Users can only INSERT files where the path starts with their company_id
CREATE POLICY "Company users can insert their own documents"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'erp_documents' 
    AND (
      EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')
      OR (
        split_part(name, '/', 1) IN (
            SELECT company_id::text 
            FROM "UserCompany" 
            WHERE user_id = auth.uid()
        )
      )
    )
);
