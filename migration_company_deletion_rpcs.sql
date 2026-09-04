-- Up Migration: Add status columns and soft-delete RPCs

ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ACTIVE';
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS deletion_scheduled_at TIMESTAMP WITH TIME ZONE;

CREATE OR REPLACE FUNCTION request_company_deletion(p_company_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "Company" 
  SET status = 'PENDING_DELETION', 
      deletion_scheduled_at = NOW() + INTERVAL '30 days' 
  WHERE id = p_company_id;
END;
$$;

CREATE OR REPLACE FUNCTION cancel_company_deletion(p_company_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "Company" 
  SET status = 'ACTIVE', deletion_scheduled_at = NULL 
  WHERE id = p_company_id;
END;
$$;
