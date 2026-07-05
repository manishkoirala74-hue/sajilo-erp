-- Migration: 077_structural_uuid_fix.sql
-- Description: Convert the created_by column on the Company table from text to UUID for better integrity and performance.

-- WARNING: This migration will fail if any existing rows in the Company table 
-- have a 'created_by' value that is not a valid UUID format (e.g., empty string or arbitrary text).
-- Please ensure data is cleaned up before running this in production.

-- 1. Drop the policies that depend on the column before we can alter its type
DROP POLICY IF EXISTS "company_secure_isolation_policy" ON public."Company";
DROP POLICY IF EXISTS "Insert Company" ON public."Company";

-- 2. Alter the column type to native UUID
ALTER TABLE public."Company"
ALTER COLUMN created_by TYPE uuid USING created_by::uuid;

-- 3. Recreate the Insert Company policy with native types (no casting needed!)
CREATE POLICY "Insert Company" ON public."Company"
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = created_by);

-- 4. Recreate the isolation policy
-- TODO: You must paste the definition for "company_secure_isolation_policy" here!
-- CREATE POLICY "company_secure_isolation_policy" ON public."Company" ...
