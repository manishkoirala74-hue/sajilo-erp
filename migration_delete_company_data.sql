-- Up Migration: Hard deletion backend sweeper RPC & Governance Patch

-- 1. Patch the Anti-Tamper Trigger to respect maintenance_mode (allowing hard deletion of tenants)
CREATE OR REPLACE FUNCTION trg_gl_journal_anti_tamper()
RETURNS TRIGGER AS $$
DECLARE
    v_maintenance_mode TEXT;
BEGIN
    BEGIN
        v_maintenance_mode := current_setting('sajilo.maintenance_mode', true);
    EXCEPTION WHEN OTHERS THEN
        v_maintenance_mode := 'false';
    END;
    
    IF v_maintenance_mode = 'true' THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
    END IF;

    IF OLD.status = 'Posted' THEN
        RAISE EXCEPTION 'Append-Only Ledger Violation: Cannot delete a Posted journal entry.';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- 2. Sweeper RPC
CREATE OR REPLACE FUNCTION delete_company_data(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  -- [CRITICAL FIX]: Bypass Kernel Governance Triggers (Chart of Accounts & GL Journals)
  PERFORM set_config('sajilo.maintenance_mode', 'true', true);

  -- [CRITICAL FIX]: Lift the Ghost Mode lock so ON DELETE CASCADE is permitted
  UPDATE "Company" SET status = 'DELETING' WHERE id::text = p_company_id::text;

  -- Delete UserCompany explicitly since it uses a TEXT company_id and cannot natively cascade
  DELETE FROM "UserCompany" WHERE company_id = p_company_id::text;

  -- Utilizing ON DELETE CASCADE, this single command natively wipes the tenant data
  DELETE FROM "Company" WHERE id::text = p_company_id::text;
END;
$$;

-- Revoke public access so it can only be called by a secure backend service (e.g., cron job with service_role)
REVOKE EXECUTE ON FUNCTION delete_company_data(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION delete_company_data(uuid) FROM anon, authenticated;
