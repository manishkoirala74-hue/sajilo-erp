-- 082_rbac_uuid_conversion.sql
-- Resolves uuid = text operator mismatches and enforces native UUID types safely.

-- ============================================================================
-- 1. Create NEW check_user_operational_access_rpc with UUID signature
-- ============================================================================
CREATE OR REPLACE FUNCTION check_user_operational_access_rpc(
    p_user_id UUID, 
    p_company_id UUID, 
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
    -- 0. Admin bypass
    IF EXISTS (SELECT 1 FROM "User" WHERE id = p_user_id AND role = 'admin' AND company_scope = 'ALL') THEN
        RETURN TRUE;
    END IF;
    -- 1. Check for Tenant Admin
    SELECT is_tenant_admin INTO v_is_tenant_admin
    FROM "UserCompany"
    WHERE user_id = p_user_id AND company_id = p_company_id;

    IF v_is_tenant_admin = true THEN RETURN TRUE; END IF;

    -- 2. Check for Active Overrides (DENY first, then GRANT)
    SELECT override_type INTO v_override_type
    FROM "UserPermissionOverride"
    WHERE user_id = p_user_id 
      AND (company_id IS NULL OR company_id = p_company_id)
      AND module_key = p_module 
      AND operation = p_operation
      AND (valid_from IS NULL OR valid_from <= NOW())
      AND (expires_at IS NULL OR expires_at > NOW())
      AND override_type = 'DENY'
    ORDER BY company_id NULLS LAST LIMIT 1;
    
    IF v_override_type = 'DENY' THEN RETURN FALSE; END IF;

    SELECT override_type INTO v_override_type
    FROM "UserPermissionOverride"
    WHERE user_id = p_user_id 
      AND (company_id IS NULL OR company_id = p_company_id)
      AND module_key = p_module 
      AND operation = p_operation
      AND (valid_from IS NULL OR valid_from <= NOW())
      AND (expires_at IS NULL OR expires_at > NOW())
      AND override_type = 'GRANT'
    ORDER BY company_id NULLS LAST LIMIT 1;

    IF v_override_type = 'GRANT' THEN RETURN TRUE; END IF;

    -- 3. Resolve Role
    SELECT company_scope, global_role_id INTO v_scope, v_global_role_id
    FROM "User" WHERE id = p_user_id;

    IF v_scope = 'ALL' THEN
        v_target_role_id := v_global_role_id;
        IF v_target_role_id IS NULL AND EXISTS (SELECT 1 FROM "User" WHERE id = p_user_id AND role = 'admin') THEN
            RETURN TRUE; 
        END IF;
    ELSE
        SELECT company_role_id INTO v_company_role_id
        FROM "UserCompany" WHERE user_id = p_user_id AND company_id = p_company_id;
        v_target_role_id := v_company_role_id;
    END IF;

    IF v_target_role_id IS NULL THEN
        IF EXISTS (SELECT 1 FROM "User" WHERE id = p_user_id AND role = 'admin') THEN RETURN TRUE; END IF;
        RETURN FALSE;
    END IF;

    SELECT menu_permissions INTO v_menu_permissions
    FROM "CompanyRole" WHERE id = v_target_role_id;

    IF (v_menu_permissions->p_module->>p_operation) = 'true' THEN RETURN TRUE; END IF;
    IF (v_menu_permissions->p_module->>p_operation)::BOOLEAN = true THEN RETURN TRUE; END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION check_user_operational_access_rpc(UUID, UUID, TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION check_user_operational_access_rpc(UUID, UUID, TEXT, TEXT) TO authenticated, service_role;


-- ============================================================================
-- 2. Update Upstream Callers (rpc_post_gl_transaction)
-- ============================================================================
CREATE OR REPLACE FUNCTION rpc_post_gl_transaction(
    p_company_id UUID,
    p_date DATE,
    p_description TEXT,
    p_module TEXT,
    p_source_id UUID,
    p_source_type TEXT,
    p_lines JSONB,
    p_is_reversal BOOLEAN DEFAULT false,
    p_lock_cogs BOOLEAN DEFAULT false,
    p_voucher_no TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_journal_id UUID;
    v_line JSONB;
    v_item_id UUID;
    v_cost_at_sale NUMERIC;
    v_total_debit NUMERIC := 0;
    v_total_credit NUMERIC := 0;
    v_dr NUMERIC;
    v_cr NUMERIC;
    v_cogs_acc UUID;
    v_inv_acc UUID;
    v_qty NUMERIC;
    v_entity_type TEXT;
    v_entity_id UUID;
    v_due_date DATE;
    v_resolved_account_id UUID;
    v_op TEXT;
    v_mod TEXT;
    v_source_created_by UUID;
    v_is_tenant_admin BOOLEAN;
BEGIN
    -- RBAC ENFORCEMENT BLOCKER & DUAL CONTROL
    v_op := CASE WHEN p_is_reversal THEN 'reverse' ELSE 'approve' END;
    v_mod := COALESCE(p_source_type, p_module);
    
    IF auth.uid() IS NOT NULL THEN
        -- 1. Enforce 'approve' / 'reverse' permission (Using native UUIDs now)
        IF NOT check_user_operational_access_rpc(auth.uid(), p_company_id, v_mod, v_op) THEN
            RAISE EXCEPTION 'RBAC_VIOLATION: User lacks explicit % permission for %.', v_op, v_mod;
        END IF;

        -- 2. Dual Control: Approver cannot be Creator (unless they are a Tenant Admin)
        IF v_op = 'approve' AND p_source_type IS NOT NULL AND p_source_id IS NOT NULL THEN
            -- Fetch created_by dynamically from the source document
            BEGIN
                EXECUTE format('SELECT created_by FROM %I WHERE id = $1', p_source_type)
                INTO v_source_created_by
                USING p_source_id;
            EXCEPTION WHEN OTHERS THEN
                v_source_created_by := NULL;
            END;

            IF v_source_created_by IS NOT NULL AND auth.uid() = v_source_created_by THEN
                -- Check if user is tenant_admin to bypass Dual Control
                SELECT is_tenant_admin INTO v_is_tenant_admin
                FROM "UserCompany"
                WHERE user_id = auth.uid() AND company_id = p_company_id;

                IF v_is_tenant_admin IS NOT TRUE THEN
                    RAISE EXCEPTION 'RBAC_VIOLATION: Dual-control enforced. You cannot approve your own % entry.', p_source_type;
                END IF;
            END IF;
        END IF;
    END IF;

    -- 1. Create the Journal Header
    INSERT INTO "GeneralLedgerJournal" (
        company_id, entry_date, description, reference_module, 
        source_document_id, source_document_type, status, total_debit, total_credit, is_balanced, voucher_no
    ) VALUES (
        p_company_id, p_date, p_description, p_module, 
        p_source_id, p_source_type, 'Posted', 0, 0, false, p_voucher_no
    ) RETURNING id INTO v_journal_id;

    -- 2. Process all lines
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
        v_dr := COALESCE((v_line->>'debit_amount')::NUMERIC, 0);
        v_cr := COALESCE((v_line->>'credit_amount')::NUMERIC, 0);
        v_entity_type := v_line->>'entity_type';
        
        BEGIN
            v_entity_id := (v_line->>'entity_id')::UUID;
        EXCEPTION WHEN OTHERS THEN
            v_entity_id := NULL;
        END;
        
        BEGIN
            v_due_date := (v_line->>'due_date')::DATE;
        EXCEPTION WHEN OTHERS THEN
            v_due_date := p_date;
        END;

        -- Resolve Account ID using account_category if account_id is not explicitly provided
        IF (v_line->>'account_id') IS NOT NULL THEN
            v_resolved_account_id := (v_line->>'account_id')::UUID;
        ELSIF (v_line->>'account_category') IS NOT NULL AND (v_line->>'item_id') IS NOT NULL THEN
            v_resolved_account_id := resolve_item_gl_account_rpc(p_company_id, (v_line->>'item_id')::UUID, (v_line->>'account_category'));
        ELSE
            v_resolved_account_id := NULL;
        END IF;

        -- Insert normal line
        IF v_dr > 0 OR v_cr > 0 THEN
            INSERT INTO "GeneralLedgerLine" (
                journal_id, company_id, account_id, account_code, account_name, account_type,
                debit_amount, credit_amount, description, entity_type, entity_id, due_date
            ) VALUES (
                v_journal_id, p_company_id, 
                v_resolved_account_id, 
                v_line->>'account_code', 
                v_line->>'account_name', 
                v_line->>'account_type',
                v_dr, v_cr, 
                COALESCE(v_line->>'description', p_description),
                v_entity_type, v_entity_id, COALESCE(v_due_date, p_date)
            );
            v_total_debit := v_total_debit + v_dr;
            v_total_credit := v_total_credit + v_cr;
        END IF;

        -- 3. Lock COGS and auto-generate COGS/Inventory Lines if requested
        IF p_lock_cogs = true AND (v_line->>'item_id') IS NOT NULL AND (v_line->>'is_physical')::BOOLEAN = true THEN
            v_item_id := (v_line->>'item_id')::UUID;
            v_qty := (v_line->>'quantity')::NUMERIC;
            
            -- Reversal uses exact historical cost, Normal post locks current cost
            IF p_is_reversal THEN
                v_cost_at_sale := COALESCE((v_line->>'cost_at_sale')::NUMERIC, 0);
            ELSE
                SELECT COALESCE(current_unit_cost, weighted_average_cost, 0) 
                INTO v_cost_at_sale 
                FROM "Item" WHERE id = v_item_id FOR SHARE; -- Read lock
            END IF;

            v_cogs_acc := resolve_item_gl_account_rpc(p_company_id, v_item_id, 'cogs');
            v_inv_acc := resolve_item_gl_account_rpc(p_company_id, v_item_id, 'inventory');

            IF v_cogs_acc IS NOT NULL AND v_inv_acc IS NOT NULL AND v_cost_at_sale > 0 THEN
                IF p_is_reversal THEN
                    -- Reverse: DR Inventory, CR COGS
                    INSERT INTO "GeneralLedgerLine" (journal_id, company_id, account_id, debit_amount, credit_amount, description) 
                    VALUES (v_journal_id, p_company_id, v_inv_acc, (v_qty * v_cost_at_sale), 0, 'Return in: ' || (v_line->>'item_name'));
                    
                    INSERT INTO "GeneralLedgerLine" (journal_id, company_id, account_id, debit_amount, credit_amount, description) 
                    VALUES (v_journal_id, p_company_id, v_cogs_acc, 0, (v_qty * v_cost_at_sale), 'COGS reversal: ' || (v_line->>'item_name'));
                ELSE
                    -- Normal: DR COGS, CR Inventory
                    INSERT INTO "GeneralLedgerLine" (journal_id, company_id, account_id, debit_amount, credit_amount, description) 
                    VALUES (v_journal_id, p_company_id, v_cogs_acc, (v_qty * v_cost_at_sale), 0, 'COGS: ' || (v_line->>'item_name'));
                    
                    INSERT INTO "GeneralLedgerLine" (journal_id, company_id, account_id, debit_amount, credit_amount, description) 
                    VALUES (v_journal_id, p_company_id, v_inv_acc, 0, (v_qty * v_cost_at_sale), 'Inventory out: ' || (v_line->>'item_name'));
                END IF;

                v_total_debit := v_total_debit + (v_qty * v_cost_at_sale);
                v_total_credit := v_total_credit + (v_qty * v_cost_at_sale);
            END IF;
        END IF;

    END LOOP;

    -- 4. Finalize Journal Header
    UPDATE "GeneralLedgerJournal"
    SET total_debit = v_total_debit,
    total_credit = v_total_credit,
    is_balanced = (ABS(v_total_debit - v_total_credit) < 0.01)
    WHERE id = v_journal_id;

    RETURN v_journal_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION rpc_post_gl_transaction(UUID, DATE, TEXT, TEXT, UUID, TEXT, JSONB, BOOLEAN, BOOLEAN, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION rpc_post_gl_transaction(UUID, DATE, TEXT, TEXT, UUID, TEXT, JSONB, BOOLEAN, BOOLEAN, TEXT) TO authenticated, service_role;


-- ============================================================================
-- 3. Safely Drop Old Text-Based Function Signature
-- ============================================================================
DROP FUNCTION IF EXISTS check_user_operational_access_rpc(UUID, TEXT, TEXT, TEXT);

-- ============================================================================
-- 4. Update AuditLog RLS Policy natively
-- ============================================================================
DROP POLICY IF EXISTS "Enable read for tenant admins" ON "AuditLog";

CREATE POLICY "Enable read for tenant admins" ON "AuditLog"
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM "UserCompany"
        WHERE user_id = auth.uid() 
        AND is_tenant_admin = true
    )
);
