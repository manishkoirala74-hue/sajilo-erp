-- 080_rbac_enterprise_upgrade.sql
-- Upgrades RBAC engine to Enterprise Standard

-- 1. Add valid_from to UserPermissionOverride
ALTER TABLE "UserPermissionOverride" 
ADD COLUMN IF NOT EXISTS valid_from TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 2. Add is_tenant_admin to UserCompany
ALTER TABLE "UserCompany"
ADD COLUMN IF NOT EXISTS is_tenant_admin BOOLEAN DEFAULT FALSE;

-- 3. Create generic AuditLog table
CREATE TABLE IF NOT EXISTS "AuditLog" (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name TEXT NOT NULL,
    record_id UUID NOT NULL,
    action TEXT NOT NULL,
    old_data JSONB,
    new_data JSONB,
    changed_by UUID,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on AuditLog
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON "AuditLog";
CREATE POLICY "Enable all for authenticated users" ON "AuditLog" FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. Create trigger function for logging
CREATE OR REPLACE FUNCTION log_system_changes()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO "AuditLog" (
        table_name,
        record_id,
        action,
        old_data,
        new_data,
        changed_by,
        changed_at
    ) VALUES (
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        TG_OP,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
        coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
        NOW()
    );
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Attach triggers to high-value RBAC tables
DROP TRIGGER IF EXISTS trg_audit_company_role ON "CompanyRole";
CREATE TRIGGER trg_audit_company_role
AFTER INSERT OR UPDATE OR DELETE ON "CompanyRole"
FOR EACH ROW EXECUTE FUNCTION log_system_changes();

DROP TRIGGER IF EXISTS trg_audit_user_company ON "UserCompany";
CREATE TRIGGER trg_audit_user_company
AFTER INSERT OR UPDATE OR DELETE ON "UserCompany"
FOR EACH ROW EXECUTE FUNCTION log_system_changes();

DROP TRIGGER IF EXISTS trg_audit_user_permission_override ON "UserPermissionOverride";
CREATE TRIGGER trg_audit_user_permission_override
AFTER INSERT OR UPDATE OR DELETE ON "UserPermissionOverride"
FOR EACH ROW EXECUTE FUNCTION log_system_changes();

-- 6. Update Access Checker Function
CREATE OR REPLACE FUNCTION check_user_operational_access_rpc(
    p_user_id UUID, 
    p_company_id TEXT, 
    p_module TEXT, 
    p_operation TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    v_scope TEXT;
    v_global_role_id UUID;
    v_company_role_id UUID;
    v_target_role_id UUID;
    v_menu_permissions JSONB;
    v_override_type TEXT;
    v_is_tenant_admin BOOLEAN;
BEGIN
    -- 0. Admin bypass (for emergency or system tasks)
    IF EXISTS (SELECT 1 FROM "User" WHERE id = p_user_id AND role = 'admin' AND company_scope = 'ALL') THEN
        RETURN TRUE;
    END IF;

    -- 1. Check for Tenant Admin (is_tenant_admin flag in UserCompany)
    SELECT is_tenant_admin INTO v_is_tenant_admin
    FROM "UserCompany"
    WHERE user_id = p_user_id::TEXT AND company_id = p_company_id;

    IF v_is_tenant_admin = true THEN
        RETURN TRUE;
    END IF;

    -- 2. Check for Active Overrides (Highest Priority)
    -- First check for DENY
    SELECT override_type INTO v_override_type
    FROM "UserPermissionOverride"
    WHERE user_id = p_user_id 
      AND (company_id IS NULL OR company_id::TEXT = p_company_id)
      AND module_key = p_module 
      AND operation = p_operation
      AND (valid_from IS NULL OR valid_from <= NOW())
      AND (expires_at IS NULL OR expires_at > NOW())
      AND override_type = 'DENY'
    ORDER BY company_id NULLS LAST
    LIMIT 1;
    
    IF v_override_type = 'DENY' THEN
        RETURN FALSE;
    END IF;

    -- Then check for GRANT
    SELECT override_type INTO v_override_type
    FROM "UserPermissionOverride"
    WHERE user_id = p_user_id 
      AND (company_id IS NULL OR company_id::TEXT = p_company_id)
      AND module_key = p_module 
      AND operation = p_operation
      AND (valid_from IS NULL OR valid_from <= NOW())
      AND (expires_at IS NULL OR expires_at > NOW())
      AND override_type = 'GRANT'
    ORDER BY company_id NULLS LAST
    LIMIT 1;

    IF v_override_type = 'GRANT' THEN
        RETURN TRUE;
    END IF;

    -- 3. Resolve Role
    SELECT company_scope, global_role_id INTO v_scope, v_global_role_id
    FROM "User" WHERE id = p_user_id;

    IF v_scope = 'ALL' THEN
        -- Admin / Global Scope
        v_target_role_id := v_global_role_id;
        
        -- Fallback if admin has no explicit global role set yet (migration safety)
        IF v_target_role_id IS NULL AND EXISTS (SELECT 1 FROM "User" WHERE id = p_user_id AND role = 'admin') THEN
            RETURN TRUE; 
        END IF;
    ELSE
        -- Specific Company Scope
        SELECT company_role_id INTO v_company_role_id
        FROM "UserCompany"
        WHERE user_id = p_user_id::TEXT AND company_id = p_company_id;

        v_target_role_id := v_company_role_id;
    END IF;

    -- 4. Extract JSONB Permissions
    IF v_target_role_id IS NULL THEN
        -- Legacy admin safety check
        IF EXISTS (SELECT 1 FROM "User" WHERE id = p_user_id AND role = 'admin') THEN
            RETURN TRUE;
        END IF;
        RETURN FALSE;
    END IF;

    SELECT menu_permissions INTO v_menu_permissions
    FROM "CompanyRole"
    WHERE id = v_target_role_id;

    -- Evaluate JSONB: payload->module->>operation == 'true' (or boolean true)
    IF (v_menu_permissions->p_module->>p_operation) = 'true' THEN
        RETURN TRUE;
    END IF;
    
    IF (v_menu_permissions->p_module->>p_operation)::BOOLEAN = true THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
