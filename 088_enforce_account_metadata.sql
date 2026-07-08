-- 088_enforce_account_metadata.sql
-- Enforce NOT NULL on financial_statement and normal_balance in ChartOfAccount

BEGIN;

-- 1. Backfill existing nulls for financial_statement
UPDATE "ChartOfAccount"
SET "financial_statement" = CASE
  WHEN account_type IN ('Revenue', 'Income', 'Other Income', 'Expense', 'Expenses', 'COGS', 'Cost of Sales', 'OPEX', 'Operating Expense', 'Cost of Goods Sold', 'Other Expense') THEN 'income_statement'
  ELSE 'balance_sheet'
END
WHERE "financial_statement" IS NULL;

-- 2. Backfill existing nulls for normal_balance
UPDATE "ChartOfAccount"
SET "normal_balance" = CASE
  WHEN account_type IN ('Asset', 'COGS', 'Cost of Sales', 'OPEX', 'Operating Expense', 'Cost of Goods Sold', 'Expense', 'Expenses', 'Other Expense') THEN 'Debit'
  ELSE 'Credit'
END
WHERE "normal_balance" IS NULL;

-- 3. Add NOT NULL constraint to financial_statement
ALTER TABLE "ChartOfAccount" 
ALTER COLUMN "financial_statement" SET NOT NULL;

-- 4. Add NOT NULL constraint to normal_balance
ALTER TABLE "ChartOfAccount" 
ALTER COLUMN "normal_balance" SET NOT NULL;

COMMIT;
