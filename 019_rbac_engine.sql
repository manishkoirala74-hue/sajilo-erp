-- 019_rbac_engine.sql
-- Implements institutional-grade Multi-Tenant RBAC engine.

-- 1. Create the new CompanyRole table
CREATE TABLE IF NOT EXISTS "CompanyRole" (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID, -- NULL means it's a global template
    role_name TEXT NOT NULL,
    menu_permissions JSONB DEFAULT '{}'::jsonb,
    sidebar_visibility JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on CompanyRole
ALTER TABLE "CompanyRole" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON "CompanyRole";
CREATE POLICY "Enable all for authenticated users" ON "CompanyRole" FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. Alter User table
ALTER TABLE "User" 
ADD COLUMN IF NOT EXISTS company_scope TEXT DEFAULT 'SELECTED',
ADD COLUMN IF NOT EXISTS global_role_id UUID REFERENCES "CompanyRole"(id);

-- 3. Alter UserCompany table
ALTER TABLE "UserCompany"
ADD COLUMN IF NOT EXISTS company_role_id UUID REFERENCES "CompanyRole"(id);

-- 4. Create UserPermissionOverride table
CREATE TABLE IF NOT EXISTS "UserPermissionOverride" (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    company_id UUID, -- NULL if global override
    module_key TEXT NOT NULL,
    operation TEXT NOT NULL,
    override_type TEXT NOT NULL CHECK (override_type IN ('GRANT', 'DENY')),
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by TEXT
);

-- Enable RLS
ALTER TABLE "UserPermissionOverride" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON "UserPermissionOverride";
CREATE POLICY "Enable all for authenticated users" ON "UserPermissionOverride" FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. Create the PL/PGSQL Access Checker
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
BEGIN
    -- 0. Admin bypass (for emergency or system tasks)
    IF EXISTS (SELECT 1 FROM "User" WHERE id = p_user_id AND role = 'admin' AND company_scope = 'ALL') THEN
        -- We will allow 'ALL' admins to bypass or we can force them to use JSONB.
        -- Let's force JSONB evaluation except if there's no role assigned yet (migration safety)
    END IF;

    -- 1. Check for Active Overrides (Highest Priority)
    -- First check for DENY
    SELECT override_type INTO v_override_type
    FROM "UserPermissionOverride"
    WHERE user_id = p_user_id 
      AND (company_id IS NULL OR company_id::TEXT = p_company_id)
      AND module_key = p_module 
      AND operation = p_operation
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
      AND (expires_at IS NULL OR expires_at > NOW())
      AND override_type = 'GRANT'
    ORDER BY company_id NULLS LAST
    LIMIT 1;

    IF v_override_type = 'GRANT' THEN
        RETURN TRUE;
    END IF;

    -- 2. Resolve Role
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

    -- 3. Extract JSONB Permissions
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


-- 6. Integrate with rpc_post_gl_transaction
CREATE OR REPLACE FUNCTION rpc_post_gl_transaction(
    p_company_id UUID,
    p_date DATE,
    p_description TEXT,
    p_module TEXT,
    p_source_id UUID,
    p_source_type TEXT,
    p_lines JSONB,
    p_is_reversal BOOLEAN DEFAULT false,
    p_lock_cogs BOOLEAN DEFAULT false
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
    v_updated_line_items JSONB := '[]'::JSONB;
    v_original_line_items JSONB;
    v_op TEXT;
    v_mod TEXT;
BEGIN
    -- RBAC ENFORCEMENT BLOCKER
    v_op := CASE WHEN p_is_reversal THEN 'reverse' ELSE 'create' END;
    -- Determine target module identifier based on p_source_type or p_module
    v_mod := COALESCE(p_source_type, p_module);
    
    -- Exclude system-level automated postings (if no uid is available in context)
    IF auth.uid() IS NOT NULL THEN
        IF NOT check_user_operational_access_rpc(auth.uid(), p_company_id::TEXT, v_mod, v_op) THEN
            RAISE EXCEPTION 'RBAC_VIOLATION: User lacks explicit % permission for %.', v_op, v_mod;
        END IF;
    END IF;

    -- 1. Create the Journal Header
    INSERT INTO "GeneralLedgerJournal" (
        company_id, entry_date, description, reference_module, 
        source_document_id, source_document_type, status, total_debit, total_credit, is_balanced
    ) VALUES (
        p_company_id, p_date, p_description, p_module, 
        p_source_id::TEXT, p_source_type, 'Posted', 0, 0, false
    ) RETURNING id INTO v_journal_id;

    -- Fetch original line items if source document exists
    IF p_source_type = 'SalesInvoice' THEN
        SELECT line_items INTO v_original_line_items FROM "SalesInvoice" WHERE id = p_source_id;
    ELSIF p_source_type = 'POSSale' THEN
        SELECT line_items INTO v_original_line_items FROM "POSSale" WHERE id = p_source_id;
    ELSIF p_source_type = 'SalesReturn' THEN
        SELECT line_items INTO v_original_line_items FROM "SalesReturn" WHERE id = p_source_id;
    END IF;

    -- 2. Process all lines
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
        v_dr := COALESCE((v_line->>'debit_amount')::NUMERIC, 0);
        v_cr := COALESCE((v_line->>'credit_amount')::NUMERIC, 0);
        v_entity_type := v_line->>'entity_type';
        
        -- Safe UUID cast handling
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

        -- Insert normal line
        IF v_dr > 0 OR v_cr > 0 THEN
            INSERT INTO "GeneralLedgerLine" (
                company_id, journal_id, account_id, account_code, account_name, account_type,
                debit_amount, credit_amount, description, entity_type, entity_id, due_date
            ) VALUES (
                p_company_id, v_journal_id::TEXT, 
                COALESCE((v_line->>'account_id'), resolve_item_gl_account_rpc(p_company_id, 
(v_line->>'item_id')::UUID, (v_line->>'account_category'))::TEXT),
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
            
            IF p_is_reversal THEN
                v_cost_at_sale := COALESCE((v_line->>'cost_at_sale')::NUMERIC, 0);
            ELSE
                -- Lock row to prevent race condition during cost reading
                SELECT COALESCE(current_unit_cost, weighted_average_cost, 0) 
                INTO v_cost_at_sale 
                FROM "Item" WHERE id = v_item_id FOR SHARE;
            END IF;

            -- Update JSON array to record frozen cost
            v_line := jsonb_set(v_line, '{cost_at_sale}', to_jsonb(v_cost_at_sale));

            v_cogs_acc := resolve_item_gl_account_rpc(p_company_id, v_item_id, 'cogs');
            v_inv_acc := resolve_item_gl_account_rpc(p_company_id, v_item_id, 'inventory');

            IF v_cogs_acc IS NOT NULL AND v_inv_acc IS NOT NULL AND v_cost_at_sale > 0 THEN
                IF p_is_reversal THEN
                    -- Reverse: DR Inventory, CR COGS
                    INSERT INTO "GeneralLedgerLine" (company_id, journal_id, account_id, debit_amount, 
credit_amount, description) 
                    VALUES (p_company_id, v_journal_id::TEXT, v_inv_acc::TEXT, (v_qty * v_cost_at_sale), 0, 'Return 
in: ' || (v_line->>'item_name'));
                    
                    INSERT INTO "GeneralLedgerLine" (company_id, journal_id, account_id, debit_amount, 
credit_amount, description) 
                    VALUES (p_company_id, v_journal_id::TEXT, v_cogs_acc::TEXT, 0, (v_qty * v_cost_at_sale), 'COGS 
reversal: ' || (v_line->>'item_name'));
                ELSE
                    -- Normal: DR COGS, CR Inventory
                    INSERT INTO "GeneralLedgerLine" (company_id, journal_id, account_id, debit_amount, 
credit_amount, description) 
                    VALUES (p_company_id, v_journal_id::TEXT, v_cogs_acc::TEXT, (v_qty * v_cost_at_sale), 0, 'COGS: 
' || (v_line->>'item_name'));
                    
                    INSERT INTO "GeneralLedgerLine" (company_id, journal_id, account_id, debit_amount, 
credit_amount, description) 
                    VALUES (p_company_id, v_journal_id::TEXT, v_inv_acc::TEXT, 0, (v_qty * v_cost_at_sale), 
'Inventory out: ' || (v_line->>'item_name'));
                END IF;

                v_total_debit := v_total_debit + (v_qty * v_cost_at_sale);
                v_total_credit := v_total_credit + (v_qty * v_cost_at_sale);
            END IF;
        END IF;

        v_updated_line_items := v_updated_line_items || v_line;
    END LOOP;

    -- Update Source Documents if this is an origin creation
    IF p_lock_cogs = true AND v_original_line_items IS NOT NULL THEN
        IF p_source_type = 'SalesInvoice' THEN
            UPDATE "SalesInvoice" SET line_items = v_updated_line_items WHERE id = p_source_id;
        ELSIF p_source_type = 'POSSale' THEN
            UPDATE "POSSale" SET line_items = v_updated_line_items WHERE id = p_source_id;
        ELSIF p_source_type = 'SalesReturn' THEN
            UPDATE "SalesReturn" SET line_items = v_updated_line_items WHERE id = p_source_id;
        END IF;
    END IF;

    UPDATE "GeneralLedgerJournal"
    SET total_debit = v_total_debit,
        total_credit = v_total_credit,
        is_balanced = (ABS(v_total_debit - v_total_credit) < 0.01)
    WHERE id = v_journal_id;

    RETURN v_journal_id;
END;
$$ LANGUAGE plpgsql;
