-- 117_secure_user_columns_trigger_rollback.sql
DROP TRIGGER IF EXISTS trg_prevent_role_escalation_trigger ON "User";
DROP FUNCTION IF EXISTS trg_prevent_role_escalation();
