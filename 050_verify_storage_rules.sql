-- Migration script: 050_verify_storage_rules.sql

-- 1. Create a secure function to check company access
CREATE OR REPLACE FUNCTION public.user_has_company_access(company_uuid text)
RETURNS boolean AS $$
BEGIN
    -- Superadmins can access everything
    IF EXISTS (SELECT 1 FROM public."User" WHERE id = auth.uid() AND role = 'admin') THEN
        RETURN true;
    END IF;
    
    -- Check if user is mapped to the company
    RETURN EXISTS (
        SELECT 1 
        FROM public."UserCompany" 
        WHERE user_id = auth.uid() 
        AND company_id::text = company_uuid
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Drop the old policies to prevent collision
DROP POLICY IF EXISTS "Company users can insert their own documents" ON storage.objects;

-- 3. Create the new dynamic deep-directory insert policy
CREATE POLICY "Allow Selective Multi-Tenant Deep Directory Writes" ON storage.objects
FOR INSERT
WITH CHECK (
    bucket_id = 'erp_documents' 
    AND public.user_has_company_access(split_part(name, '/', 1))
);

-- Note: We retain the old SELECT policy from 049 as it already allows reads securely.
