-- Reset all balances to 0
UPDATE "ChartOfAccount" SET current_balance = 0;

-- Recalculate balances based on GL lines
WITH LiveBalances AS (
    SELECT 
        account_id,
        SUM(COALESCE(debit_amount, 0) - COALESCE(credit_amount, 0)) as live_balance
    FROM "GeneralLedgerLine"
    GROUP BY account_id
)
UPDATE "ChartOfAccount" coa
SET current_balance = lb.live_balance
FROM LiveBalances lb
WHERE coa.id = lb.account_id;

-- Also update BankAccount current_balance just in case it's used elsewhere
UPDATE "BankAccount" ba
SET current_balance = coa.current_balance
FROM "ChartOfAccount" coa
WHERE ba.gl_account_id = coa.id;
