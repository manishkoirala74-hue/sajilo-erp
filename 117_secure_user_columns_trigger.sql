-- 117_secure_user_columns_trigger.sql
CREATE OR REPLACE FUNCTION trg_prevent_role_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Allow the service_role (backend/edge functions) to mutate all columns
    IF auth.role() = 'service_role' THEN
        RETURN NEW;
    END IF;

    -- Allow Super Admins to mutate all columns
    IF is_current_user_super_admin() THEN
        RETURN NEW;
    END IF;

    -- Standard users cannot mutate protected columns
    -- Silently override to OLD values
    NEW.role = OLD.role;
    NEW.is_super_admin = OLD.is_super_admin;
    NEW.company_scope = OLD.company_scope;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_role_escalation_trigger ON "User";

CREATE TRIGGER trg_prevent_role_escalation_trigger
    BEFORE UPDATE ON "User"
    FOR EACH ROW
    EXECUTE FUNCTION trg_prevent_role_escalation();
