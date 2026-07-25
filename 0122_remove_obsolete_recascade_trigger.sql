-- 0122_remove_obsolete_recascade_trigger.sql
-- Removes the legacy trigger_recascade which contains a fatal text = uuid type mismatch.
-- This trigger is completely obsolete because the Asynchronous Delta Queue 
-- (trigger_flag_recalculation_financial) now natively handles all recascade flagging.

DROP TRIGGER IF EXISTS trg_recascade_gl ON "GeneralLedgerLine";
DROP FUNCTION IF EXISTS trigger_recascade();
