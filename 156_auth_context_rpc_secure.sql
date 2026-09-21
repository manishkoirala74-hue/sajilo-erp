CREATE OR REPLACE FUNCTION public.get_user_auth_context(p_company_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  SELECT * INTO v_user FROM public."User" WHERE id = v_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_registered');
  END IF;

  -- 2. Check global account status
  IF v_user.account_status IS NOT NULL AND v_user.account_status != 'active' THEN
    RETURN jsonb_build_object('status', 'suspended');
  END IF;

  -- 3. Auto-resolve to default or oldest ACTIVE company if none requested
  IF v_resolved_company_id IS NULL THEN
    SELECT company_id INTO v_resolved_company_id
    FROM public."UserCompany"
    WHERE user_id = v_user_id
      AND (membership_status IS NULL OR membership_status = 'active')
    ORDER BY is_default DESC NULLS LAST, created_at ASC
    LIMIT 1;
  END IF;

  -- 4. No active company found? Return global context only
  IF v_resolved_company_id IS NULL THEN
    RETURN jsonb_build_object(
      'status',               'no_company',
      'user',                 row_to_json(v_user),
      'available_companies',  '[]'::jsonb
    );
  END IF;

  -- 5. Validate company membership (Prioritize Admin records if duplicates exist)
  SELECT * INTO v_uc
  FROM public."UserCompany"
  WHERE user_id = v_user_id 
    AND company_id = v_resolved_company_id
    AND (membership_status IS NULL OR membership_status = 'active')
  ORDER BY is_owner DESC, is_tenant_admin DESC 
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'company_access_denied');
  END IF;

  -- 6. Load company and role
  SELECT * INTO v_company FROM public."Company" WHERE id = v_resolved_company_id;

  IF v_uc.company_role_id IS NOT NULL THEN
    SELECT * INTO v_role FROM public."CompanyRole" WHERE id = v_uc.company_role_id;
  ELSIF v_user.global_role_id IS NOT NULL THEN
    SELECT * INTO v_role FROM public."CompanyRole" WHERE id = v_user.global_role_id;
  END IF;

  -- 7. Return full context with deduplicated company switcher array
  RETURN jsonb_build_object(
    'status',               'ok',
    'user',                 row_to_json(v_user),
    'active_company',       row_to_json(v_company),
    'is_tenant_admin',      (COALESCE(v_uc.is_tenant_admin, false) OR COALESCE(v_uc.is_owner, false)),
    'active_role',          row_to_json(v_role),
    
    -- Safe, deduplicated available companies retaining owner flags and logo
    'available_companies',  COALESCE(
      (SELECT jsonb_agg(
          jsonb_build_object(
            'id', comp.id,
            'name', comp.name,
            'logo_url', comp.logo_url,
            'is_owner', comp.is_owner,
            'is_tenant_admin', comp.is_tenant_admin
          )
       )
       FROM (
           SELECT 
               c.id, 
               c.name, 
               c.logo_url,
               bool_or(COALESCE(uc.is_owner, false)) as is_owner,
               bool_or(COALESCE(uc.is_tenant_admin, false)) as is_tenant_admin
           FROM public."Company" c
           JOIN public."UserCompany" uc ON uc.company_id = c.id
           WHERE uc.user_id = v_user_id
             AND (uc.membership_status IS NULL OR uc.membership_status = 'active')
           GROUP BY c.id, c.name, c.logo_url
           ORDER BY MIN(c.created_at) ASC
       ) comp),
      '[]'::jsonb),

    'overrides',            COALESCE(
      (SELECT jsonb_agg(row_to_json(o))
       FROM public."UserPermissionOverride" o
       WHERE o.user_id = v_user_id
         AND (o.company_id IS NULL OR o.company_id = v_resolved_company_id)
         AND (o.expires_at IS NULL OR o.expires_at > now())),
      '[]'::jsonb),
      
    'settings',             (SELECT row_to_json(s)
                             FROM public."CompanySettings" s
                             WHERE s.company_id = v_resolved_company_id
                             LIMIT 1),
                             
    'godowns',              COALESCE(
      (SELECT jsonb_agg(row_to_json(g))
       FROM public."Godown" g
       WHERE g.company_id = v_resolved_company_id AND g.status = 'Active'),
      '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_auth_context(uuid) TO authenticated;