-- 162_audit_log_rpc.sql
-- Description: Creates the log_report_generation RPC for audit compliance when generating/printing reports.

CREATE TABLE IF NOT EXISTS public.report_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public."Company"(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    report_type TEXT NOT NULL,
    parameters JSONB NOT NULL DEFAULT '{}',
    export_format TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS
ALTER TABLE public.report_audit_log ENABLE ROW LEVEL SECURITY;

-- Note: RLS policies in Sajilo typically check against the UserCompany junction table
CREATE POLICY "Users can view their company's audit logs"
    ON public.report_audit_log
    FOR SELECT
    USING (
        company_id IN (
            SELECT (company_id)::uuid 
            FROM public."UserCompany" 
            WHERE (user_id)::uuid = auth.uid()
        )
    );

CREATE POLICY "Users can insert audit logs for their company"
    ON public.report_audit_log
    FOR INSERT
    WITH CHECK (
        company_id IN (
            SELECT (company_id)::uuid 
            FROM public."UserCompany" 
            WHERE (user_id)::uuid = auth.uid()
        )
    );

-- Create the RPC for logging
CREATE OR REPLACE FUNCTION public.log_report_generation(
    p_company_id UUID,
    p_report_type TEXT,
    p_parameters JSONB,
    p_export_format TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_log_id UUID;
BEGIN
    v_user_id := auth.uid();

    IF p_company_id IS NULL THEN
        RAISE EXCEPTION 'p_company_id must not be null';
    END IF;

    -- Security validation: check if the user belongs to this company
    IF NOT EXISTS (
        SELECT 1 FROM public."UserCompany" 
        WHERE (user_id)::uuid = v_user_id 
        AND (company_id)::uuid = p_company_id
    ) THEN
        RAISE EXCEPTION 'Unauthorized: User does not belong to this company';
    END IF;

    INSERT INTO public.report_audit_log (
        company_id, user_id, report_type, parameters, export_format
    ) VALUES (
        p_company_id, v_user_id, p_report_type, p_parameters, p_export_format
    ) RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_report_generation(UUID, TEXT, JSONB, TEXT) TO authenticated;
