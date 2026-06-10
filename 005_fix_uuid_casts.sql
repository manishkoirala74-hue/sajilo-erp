-- FIX TRIGGER TYPE MISMATCH IN update_account_balances
CREATE OR REPLACE FUNCTION update_account_balances()
RETURNS TRIGGER AS $$
DECLARE
    v_is_debit_normal BOOLEAN;
BEGIN
    SELECT 
        CASE WHEN account_type IN ('Asset', 'COGS', 'Expense', 'OPEX', 'Cost of Goods Sold', 'Other Expense') THEN true ELSE false END
    INTO v_is_debit_normal
    FROM "ChartOfAccount" WHERE id::TEXT = NEW.account_id::TEXT;

    UPDATE "ChartOfAccount"
    SET current_balance = current_balance + 
        CASE 
            WHEN v_is_debit_normal THEN (NEW.debit_amount - NEW.credit_amount)
            ELSE (NEW.credit_amount - NEW.debit_amount)
        END
    WHERE id::TEXT = NEW.account_id::TEXT;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
