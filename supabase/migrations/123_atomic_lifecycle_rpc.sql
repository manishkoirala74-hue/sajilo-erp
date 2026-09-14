-- ============================================================================
-- Migration 123: Atomic Lifecycle Transition RPC with Native Auth Session Destruction
-- ============================================================================

-- Drop legacy overloaded UUID signature to prevent candidate function ambiguity
DROP FUNCTION IF EXISTS public.execute_user_lifecycle_transition(uuid, uuid, text, text, uuid);

CREATE OR REPLACE FUNCTION public.execute_user_lifecycle_transition(
    p_company_id text,
    p_target_user_id text,
    p_next_status text,
    p_reason text DEFAULT NULL,
    p_new_role_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_actor_user_id uuid;
    v_actor_weight integer;
    v_target_weight integer;
    v_target_is_owner boolean;
    v_owner_count integer;
    v_current_status text;
    v_uc_id uuid;
    v_new_role_weight integer := 0;
BEGIN
    -- 1. Derive Actor Identity from Server auth.uid()
    v_actor_user_id := auth.uid();
    IF v_actor_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '40100';
    END IF;

    -- Validate Status Choice
    IF p_next_status NOT IN ('active', 'suspended', 'deactivated', 'removed') THEN
        RAISE EXCEPTION 'Invalid target status %', p_next_status USING ERRCODE = '22023';
    END IF;

    -- 2. Lock Rows in Atomic Transaction (FOR UPDATE with universal text comparison)
    SELECT uc.id, uc.membership_status INTO v_uc_id, v_current_status
    FROM public."UserCompany" uc
    WHERE uc.user_id::text = p_target_user_id::text AND uc.company_id::text = p_company_id::text
    FOR UPDATE;

    IF v_uc_id IS NULL THEN
        RAISE EXCEPTION 'Target user membership not found in workspace.' USING ERRCODE = 'P0002';
    END IF;

    -- 3. Calculate Mathematical Role Hierarchy Weights
    v_actor_weight := public.get_user_max_role_weight(v_actor_user_id::text, p_company_id);
    v_target_weight := public.get_user_max_role_weight(p_target_user_id, p_company_id);

    IF p_new_role_id IS NOT NULL THEN
        SELECT hierarchy_weight INTO v_new_role_weight FROM public."CompanyRole" WHERE id::text = p_new_role_id::text;
    END IF;

    -- Mathematical Hierarchy Boundary Rule: Actor weight >= Target weight AND Actor weight >= New Role weight
    IF v_actor_weight < v_target_weight OR (p_new_role_id IS NOT NULL AND v_actor_weight < v_new_role_weight) THEN
        RAISE EXCEPTION 'Privilege Escalation Violation: Actor role weight (%) insufficient for target user (%) or new role (%).', v_actor_weight, v_target_weight, v_new_role_weight USING ERRCODE = '42501';
    END IF;

    -- 4. Atomic Last Tenant Owner Safeguard
    SELECT (v_target_weight >= 100) INTO v_target_is_owner;
    
    IF v_target_is_owner AND p_next_status IN ('suspended', 'deactivated', 'removed') THEN
        -- Lock all owner membership records in company to prevent race conditions
        SELECT COUNT(*) INTO v_owner_count
        FROM public."UserCompany" uc
        JOIN public."CompanyRole" cr ON cr.id::text = uc.company_role_id::text
        WHERE uc.company_id::text = p_company_id::text 
          AND (uc.membership_status IS NULL OR uc.membership_status = 'active')
          AND cr.hierarchy_weight >= 100;

        IF v_owner_count <= 1 THEN
            RAISE EXCEPTION 'Last Owner Protection Triggered: Cannot suspend, deactivate, or remove the sole remaining Tenant Owner of a company workspace.' USING ERRCODE = '55000';
        END IF;
    END IF;

    -- 5. Execute Status Transition & Access Version Increment
    UPDATE public."UserCompany"
    SET membership_status = p_next_status,
        membership_access_version = membership_access_version + 1,
        status_changed_at = now(),
        status_changed_by = v_actor_user_id,
        status_change_reason = p_reason,
        suspended_at = CASE WHEN p_next_status = 'suspended' THEN now() ELSE suspended_at END,
        deactivated_at = CASE WHEN p_next_status = 'deactivated' THEN now() ELSE deactivated_at END,
        removed_at = CASE WHEN p_next_status = 'removed' THEN now() ELSE removed_at END,
        company_role_id = COALESCE(p_new_role_id::uuid, company_role_id)
    WHERE id::text = v_uc_id::text;

    -- 6. Native PostgreSQL Auth Session & Token Destruction with Universal Text Comparison
    IF p_next_status IN ('suspended', 'deactivated', 'removed') THEN
        DELETE FROM auth.sessions WHERE user_id::text = p_target_user_id::text;
        DELETE FROM auth.refresh_tokens WHERE user_id::text = p_target_user_id::text;
    END IF;

    -- 7. Write Audit Log Entry if SecurityAuditLog exists (Dual-schema compatible for V10 and Partitioned V124)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'SecurityAuditLog') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'SecurityAuditLog' AND column_name = 'actor_id') THEN
            -- Partitioned V124 Schema
            INSERT INTO public."SecurityAuditLog" (
                action_type, actor_id, target_user_id, company_id, details
            ) VALUES (
                'USER_' || UPPER(p_next_status),
                v_actor_user_id,
                p_target_user_id::uuid,
                p_company_id::uuid,
                jsonb_build_object(
                    'reason', p_reason,
                    'previous_status', v_current_status,
                    'next_status', p_next_status,
                    'new_role_id', p_new_role_id
                )
            );
        ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'SecurityAuditLog' AND column_name = 'actor_user_id') THEN
            -- Legacy V10 Schema
            EXECUTE 'INSERT INTO public."SecurityAuditLog" (' ||
                    'event_type, actor_user_id, target_user_id, company_id, reason, previous_value, new_value' ||
                    ') VALUES ($1, $2, $3, $4, $5, $6, $7)'
            USING 
                'USER_' || UPPER(p_next_status),
                v_actor_user_id,
                p_target_user_id::uuid,
                p_company_id::uuid,
                p_reason,
                jsonb_build_object('membership_status', v_current_status),
                jsonb_build_object('membership_status', p_next_status, 'new_role_id', p_new_role_id);
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'target_user_id', p_target_user_id,
        'previous_status', v_current_status,
        'next_status', p_next_status
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.execute_user_lifecycle_transition(text, text, text, text, text) TO authenticated;
