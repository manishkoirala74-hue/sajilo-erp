-- Migration to create DocumentTemplate table
SET search_path TO public;

CREATE TABLE IF NOT EXISTS "DocumentTemplate" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES "Company"(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    document_type TEXT NOT NULL,
    layout_config JSONB DEFAULT '{}'::jsonb,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE "DocumentTemplate" ENABLE ROW LEVEL SECURITY;

-- Select Policy
CREATE POLICY "select_DocumentTemplate" ON "DocumentTemplate" FOR SELECT 
USING (
  (EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR 
  (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))
);

-- Insert Policy
CREATE POLICY "insert_DocumentTemplate" ON "DocumentTemplate" FOR INSERT 
WITH CHECK (
  (EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR 
  (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))
);

-- Update Policy
CREATE POLICY "update_DocumentTemplate" ON "DocumentTemplate" FOR UPDATE 
USING (
  (EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR 
  (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))
) WITH CHECK (
  (EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR 
  (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))
);

-- Delete Policy
CREATE POLICY "delete_DocumentTemplate" ON "DocumentTemplate" FOR DELETE 
USING (
  (EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR 
  (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))
);

-- Optional: Create a trigger to automatically update `updated_at` if a trigger function exists
-- Many supabase schemas use a common trigger function `moddatetime` or similar. We can omit it if not strictly required, or add a generic one if we see it.
