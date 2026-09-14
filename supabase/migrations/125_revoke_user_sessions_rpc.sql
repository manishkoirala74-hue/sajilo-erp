-- ============================================================================
-- Migration 125: Secure Credential Session Revocation RPC
-- Description: Dedicated RPC to revoke user auth sessions upon password reset without altering workspace membership state.
-- ============================================================================

-- Drop legacy overloaded UUID signature to prevent candidate function ambiguity
DROP FUNCTION IF EXISTS public.revoke_user_sessions(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.revoke_user_sessions(
    p_company_id text,
    p_target_user_id text,
    p_reason text DEFAULT NULL
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
BEGIN
    -- 1. Derive Actor Identity from Server auth.uid()
    v_actor_user_id := auth.uid();
    IF v_actor_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '40100';
    END IF;

    -- 2. Self-Targeting Prohibition Guardrail
    IF v_actor_user_id::text = p_target_user_id THEN
        RAISE EXCEPTION 'Self-targeting prohibition: Cannot administratively revoke your own sessions. Use the standard logout or self-service password reset flow.' USING ERRCODE = '42501';
    END IF;

    -- 3. Calculate Mathematical Role Hierarchy Weights for Active Company Context
    v_actor_weight := public.get_user_max_role_weight(v_actor_user_id::text, p_company_id);
    v_target_weight := public.get_user_max_role_weight(p_target_user_id, p_company_id);

    IF v_actor_weight < v_target_weight THEN
        RAISE EXCEPTION 'Privilege Escalation Violation: Actor role weight (%) insufficient for target user (%).', v_actor_weight, v_target_weight USING ERRCODE = '42501';
    END IF;

    -- 4. Increment Account Access Version (Universal text comparison)
    UPDATE public."User"
    SET account_access_version = account_access_version + 1,
        password_last_changed = CURRENT_DATE
    WHERE id::text = p_target_user_id::text;

    -- 5. Native PostgreSQL Auth Session & Refresh Token Destruction (Universal text comparison)
    DELETE FROM auth.sessions WHERE user_id::text = p_target_user_id::text;
    DELETE FROM auth.refresh_tokens WHERE user_id::text = p_target_user_id::text;

    -- 6. Write Audit Log Entry if SecurityAuditLog exists (Dual-schema compatible for V10 and Partitioned V124)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'SecurityAuditLog') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'SecurityAuditLog' AND column_name = 'actor_id') THEN
            -- Partitioned V124 Schema
            INSERT INTO public."SecurityAuditLog" (
                action_type, actor_id, target_user_id, company_id, details
            ) VALUES (
                'CREDENTIAL_SESSION_REVOKED',
                v_actor_user_id,
                p_target_user_id::uuid,
                p_company_id::uuid,
                jsonb_build_object(
                    'reason', COALESCE(p_reason, 'Admin issued temporary password reset'),
                    'action', 'Administrative password reset initiated',
                    'sessions_destroyed', true,
                    'account_access_version_incremented', true
                )
            );
        ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'SecurityAuditLog' AND column_name = 'actor_user_id') THEN
            -- Legacy V10 Schema
            EXECUTE 'INSERT INTO public."SecurityAuditLog" (' ||
                    'event_type, actor_user_id, target_user_id, company_id, reason, previous_value, new_value' ||
                    ') VALUES ($1, $2, $3, $4, $5, $6, $7)'
            USING 
                'CREDENTIAL_SESSION_REVOKED',
                v_actor_user_id,
                p_target_user_id::uuid,
                p_company_id::uuid,
                COALESCE(p_reason, 'Admin issued temporary password reset'),
                jsonb_build_object('action', 'Administrative password reset initiated'),
                jsonb_build_object(
                    'sessions_destroyed', true, 
                    'account_access_version_incremented', true
                );
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'target_user_id', p_target_user_id,
        'action', 'CREDENTIAL_SESSION_REVOKED'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_user_sessions(text, text, text) TO authenticated;
