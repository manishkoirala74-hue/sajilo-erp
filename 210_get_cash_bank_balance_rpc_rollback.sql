-- 210_get_cash_bank_balance_rpc_rollback.sql
-- Reverts 210_get_cash_bank_balance_rpc.sql
-- Revokes the execution grant and drops the function.
--
-- Run this script BEFORE 209_backfill_cash_bank_flags_rollback.sql and
-- BEFORE 208_add_is_cash_account_to_coa_rollback.sql.

REVOKE EXECUTE ON FUNCTION public.get_cash_bank_balance(uuid, date) FROM authenticated;
DROP FUNCTION IF EXISTS public.get_cash_bank_balance(uuid, date);
