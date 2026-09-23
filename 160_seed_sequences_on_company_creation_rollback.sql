-- 160_seed_sequences_on_company_creation_rollback.sql
-- Reverts changes made by 160_seed_sequences_on_company_creation.sql
-- WARNING: Does NOT remove sequence rows that were seeded by backfill or the trigger,
-- as those may have live voucher data. Only removes trigger and function.

BEGIN;

DROP TRIGGER IF EXISTS on_company_created_seed_sequences ON public."Company";
DROP FUNCTION IF EXISTS public.seed_default_document_sequences();

-- If you also need to remove the backfilled rows (no voucher data created):
-- DELETE FROM public."DocumentSequenceConfig"
-- WHERE starting_number = 1 AND current_number IS NULL;
-- Uncomment the above only if you are certain no vouchers have been generated.

COMMIT;
