CREATE OR REPLACE FUNCTION get_user_auth_context(p_company_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id   uuid := auth.uid();
  v_user      "User"%ROWTYPE;
  v_company   "Company"%ROWTYPE;
  v_uc        "UserCompany"%ROWTYPE;
  v_role      "CompanyRole"%ROWTYPE;
  v_resolved_company_id uuid := p_company_id;
BEGIN
  -- 1. Get user profile
  SELECT * INTO v_user FROM "User" WHERE id = v_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_registered');
  END IF;

  -- 2. Check account status
  IF v_user.account_status IS NOT NULL AND v_user.account_status != 'active' THEN
    RETURN jsonb_build_object('status', 'suspended');
  END IF;

  -- 3. If no company requested, try to auto-resolve to default or first available company
  IF v_resolved_company_id IS NULL THEN
    SELECT company_id INTO v_resolved_company_id
    FROM "UserCompany"
    WHERE user_id = v_user_id
    ORDER BY is_default DESC NULLS LAST, created_at ASC
    LIMIT 1;
  END IF;

  -- 4. Still no company resolved? Return user only (first login / no company yet)
  IF v_resolved_company_id IS NULL THEN
    RETURN jsonb_build_object(
      'status',               'no_company',
      'user',                 row_to_json(v_user),
      'available_companies',  '[]'::jsonb
    );
  END IF;

  -- 5. Validate company membership using the resolved ID
  SELECT * INTO v_uc
  FROM "UserCompany"
  WHERE user_id = v_user_id AND company_id = v_resolved_company_id
  LIMIT 1; -- Limit 1 in case of bad duplicate data

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'company_access_denied');
  END IF;

  -- 6. Load company and role
  SELECT * INTO v_company FROM "Company" WHERE id = v_resolved_company_id;

  IF v_uc.company_role_id IS NOT NULL THEN
    SELECT * INTO v_role FROM "CompanyRole" WHERE id = v_uc.company_role_id;
  ELSIF v_user.global_role_id IS NOT NULL THEN
    SELECT * INTO v_role FROM "CompanyRole" WHERE id = v_user.global_role_id;
  END IF;

  -- 7. Return full context
  RETURN jsonb_build_object(
    'status',               'ok',
    'user',                 row_to_json(v_user),
    'active_company',       row_to_json(v_company),
    'available_companies',  COALESCE(
      (SELECT jsonb_agg(row_to_json(c))
       FROM (
           SELECT DISTINCT c.*
           FROM "Company" c
           JOIN "UserCompany" uc ON uc.company_id = c.id
           WHERE uc.user_id = v_user_id
           ORDER BY c.created_at ASC
       ) c),
      '[]'::jsonb),
    'is_tenant_admin',      (v_uc.is_tenant_admin OR v_uc.is_owner),
    'active_role',          row_to_json(v_role),
    'overrides',            COALESCE(
      (SELECT jsonb_agg(row_to_json(o))
       FROM "UserPermissionOverride" o
       WHERE o.user_id = v_user_id
         AND (o.company_id IS NULL OR o.company_id = v_resolved_company_id)
         AND (o.expires_at IS NULL OR o.expires_at > now())),
      '[]'::jsonb),
    'settings',             (SELECT row_to_json(s)
                             FROM "CompanySettings" s
                             WHERE s.company_id = v_resolved_company_id
                             LIMIT 1),
    'godowns',              COALESCE(
      (SELECT jsonb_agg(row_to_json(g))
       FROM "Godown" g
       WHERE g.company_id = v_resolved_company_id AND g.status = 'Active'),
      '[]'::jsonb)
  );
END;
$$;
