-- Migration script: 052_document_attachments.sql

-- 1. Create DocumentAttachment table
CREATE TABLE IF NOT EXISTS "DocumentAttachment" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL REFERENCES "Company"("id") ON DELETE CASCADE,
    "module_type" VARCHAR(255) NOT NULL,
    "record_id" UUID NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" BIGINT,
    "mime_type" VARCHAR(255),
    "uploaded_by" UUID REFERENCES "User"("id") ON DELETE SET NULL,
    "created_date" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create Indexes for performance
CREATE INDEX IF NOT EXISTS "idx_docattach_company" ON "DocumentAttachment"("company_id");
CREATE INDEX IF NOT EXISTS "idx_docattach_record" ON "DocumentAttachment"("module_type", "record_id");

-- 3. Enable RLS
ALTER TABLE "DocumentAttachment" ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
CREATE POLICY "Company users can view their document attachments"
ON "DocumentAttachment" FOR SELECT
USING (
    company_id IN (
        SELECT "UserCompany".company_id 
        FROM "UserCompany" 
        WHERE "UserCompany".user_id = auth.uid()
    )
    OR EXISTS (
        SELECT 1 FROM "User" 
        WHERE id = auth.uid() AND role = 'admin'
    )
);

CREATE POLICY "Company users can insert their document attachments"
ON "DocumentAttachment" FOR INSERT
WITH CHECK (
    company_id IN (
        SELECT "UserCompany".company_id 
        FROM "UserCompany" 
        WHERE "UserCompany".user_id = auth.uid()
    )
    OR EXISTS (
        SELECT 1 FROM "User" 
        WHERE id = auth.uid() AND role = 'admin'
    )
);

CREATE POLICY "Company users can update their document attachments"
ON "DocumentAttachment" FOR UPDATE
USING (
    company_id IN (
        SELECT "UserCompany".company_id 
        FROM "UserCompany" 
        WHERE "UserCompany".user_id = auth.uid()
    )
    OR EXISTS (
        SELECT 1 FROM "User" 
        WHERE id = auth.uid() AND role = 'admin'
    )
);

CREATE POLICY "Company users can delete their document attachments"
ON "DocumentAttachment" FOR DELETE
USING (
    company_id IN (
        SELECT "UserCompany".company_id 
        FROM "UserCompany" 
        WHERE "UserCompany".user_id = auth.uid()
    )
    OR EXISTS (
        SELECT 1 FROM "User" 
        WHERE id = auth.uid() AND role = 'admin'
    )
);

-- 5. Bucket Restrictions
-- Update erp_documents bucket to enforce file limits (5MB) and mime types
UPDATE storage.buckets
SET 
    file_size_limit = 5242880, -- 5MB in bytes
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']::text[]
WHERE id = 'erp_documents';
