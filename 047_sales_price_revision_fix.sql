-- 047_sales_price_revision_fix.sql
-- Fixes the foreign key to point to public."User" instead of auth.users
-- This allows PostgREST to properly join the User table for the history report.

ALTER TABLE public."ItemPriceRevisionLog" DROP CONSTRAINT IF EXISTS "ItemPriceRevisionLog_created_by_fkey";

-- We add it back, pointing to public.User so our UI can do User:created_by(full_name)
ALTER TABLE public."ItemPriceRevisionLog" ADD CONSTRAINT "ItemPriceRevisionLog_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public."User"(id) ON DELETE SET NULL;
