-- Create the support tickets table
CREATE TABLE IF NOT EXISTS public."SystemSupportTicket" (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES public."Company"(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    employee_name TEXT NOT NULL,
    contact_email TEXT NOT NULL,
    category TEXT NOT NULL,
    raw_user_statement TEXT NOT NULL,
    ai_optimized_statement TEXT,
    attachment_urls TEXT[] DEFAULT '{}'::TEXT[],
    status TEXT NOT NULL DEFAULT 'Open',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public."SystemSupportTicket" ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view tickets for their company
CREATE POLICY "Users can view tickets for their company"
ON public."SystemSupportTicket"
FOR SELECT
USING (company_id IN (
    SELECT (company_id)::uuid FROM public."UserCompany" WHERE (user_id)::uuid = auth.uid()
));

-- Policy: Users can create tickets for their company
CREATE POLICY "Users can insert tickets for their company"
ON public."SystemSupportTicket"
FOR INSERT
WITH CHECK (company_id IN (
    SELECT (company_id)::uuid FROM public."UserCompany" WHERE (user_id)::uuid = auth.uid()
) AND user_id = auth.uid());

-- Storage Bucket for support attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('support-attachments', 'support-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- RLS for storage.objects
-- Allow anyone to read support attachments if they are public, or let's restrict to authenticated users
CREATE POLICY "Authenticated users can upload support attachments"
ON storage.objects
FOR INSERT
WITH CHECK (
    bucket_id = 'support-attachments'
    AND auth.role() = 'authenticated'
);

CREATE POLICY "Authenticated users can read support attachments"
ON storage.objects
FOR SELECT
USING (
    bucket_id = 'support-attachments'
    AND auth.role() = 'authenticated'
);
