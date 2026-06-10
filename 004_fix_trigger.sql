-- FIX TRIGGER TYPE MISMATCH
CREATE OR REPLACE FUNCTION check_no_group_posting()
RETURNS TRIGGER AS $$
DECLARE
    v_ledger_type TEXT;
    v_account_name TEXT;
BEGIN
    SELECT ledger_type, account_name INTO v_ledger_type, v_account_name 
    FROM "ChartOfAccount" WHERE id::TEXT = NEW.account_id::TEXT;
    
    IF v_ledger_type = 'Group Ledger' THEN
        RAISE EXCEPTION 'ERR_GROUP_LEDGER_POSTING: Cannot post to Group Ledger "%"', v_account_name
        USING ERRCODE = 'P0001';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
