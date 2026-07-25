-- 0121_fix_pending_recalculations_schema.sql
-- Fixes missing columns and constraints required by the Async Delta Queue triggers

-- 1. Add the missing updated_at column
ALTER TABLE "pending_ledger_recalculations" ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 2. Add the unique constraint for FINANCIAL module required by ON CONFLICT
CREATE UNIQUE INDEX IF NOT EXISTS uq_pending_recalc_financial 
ON "pending_ledger_recalculations" (company_id, fiscal_year_id, module_type, account_id) 
WHERE module_type = 'FINANCIAL';

-- 3. Add the unique constraint for INVENTORY module required by ON CONFLICT
CREATE UNIQUE INDEX IF NOT EXISTS uq_pending_recalc_inventory 
ON "pending_ledger_recalculations" (company_id, fiscal_year_id, module_type, item_id) 
WHERE module_type = 'INVENTORY';
