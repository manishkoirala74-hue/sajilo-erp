-- 067_fix_rls_volatile.sql
-- Reverts the STABLE modifier on user_has_company_access.
-- Some Postgres/PostgREST setups can throw errors (like PGRST or RLS errors) 
-- when evaluating SECURITY DEFINER STABLE functions that depend on request.jwt.claims (auth.uid()).

CREATE OR REPLACE FUNCTION public.user_has_company_access(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public."User" 
    WHERE id = auth.uid() AND is_super_admin = true
  ) THEN
    RETURN TRUE;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public."UserCompany" 
    WHERE company_id = p_company_id AND user_id = auth.uid()
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;
