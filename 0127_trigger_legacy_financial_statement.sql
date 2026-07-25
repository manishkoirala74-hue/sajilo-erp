-- 0127_trigger_legacy_financial_statement.sql
-- Implements legacy syncing and race-condition-safe ledger code generation.

-- 1. Drop trigger and function for idempotency
DROP TRIGGER IF EXISTS trg_sync_legacy_financial_statement ON "ChartOfAccount";
DROP FUNCTION IF EXISTS sync_legacy_financial_statement();

-- 2. Create the Trigger Function
CREATE OR REPLACE FUNCTION sync_legacy_financial_statement()
RETURNS TRIGGER AS $$
BEGIN
    -- Automatically map the legacy column based on the new schema
    -- Check both conventions just to be extremely safe, though our UI explicitly sends lowercase
    IF NEW.statement_type = 'income_statement' OR NEW.statement_type = 'Income Statement' THEN
        NEW.financial_statement := 'income_statement';
    ELSE
        NEW.financial_statement := 'balance_sheet';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Attach Trigger to ChartOfAccount
CREATE TRIGGER trg_sync_legacy_financial_statement
BEFORE INSERT OR UPDATE ON "ChartOfAccount"
FOR EACH ROW EXECUTE FUNCTION sync_legacy_financial_statement();


-- 4. Safe Concurrency RPC for generating sequential ledger codes
DROP FUNCTION IF EXISTS get_next_account_code(UUID);

CREATE OR REPLACE FUNCTION get_next_account_code(p_parent_id UUID)
RETURNS TEXT 
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_parent_code TEXT;
    v_max_child_code TEXT;
    v_next_numeric BIGINT;
    v_stripped_max TEXT;
BEGIN
    -- Lock the parent row to serialize requests trying to create a child under this parent
    SELECT account_code INTO v_parent_code
    FROM "ChartOfAccount"
    WHERE id = p_parent_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Parent account with ID % not found', p_parent_id;
    END IF;

    -- Strip non-digits from parent code
    v_parent_code := regexp_replace(v_parent_code, '\D', '', 'g');

    -- Find the max numeric child code that starts with the parent code
    SELECT account_code INTO v_max_child_code
    FROM "ChartOfAccount"
    WHERE parent_account_id = p_parent_id
      AND regexp_replace(account_code, '\D', '', 'g') LIKE (v_parent_code || '%')
      AND length(regexp_replace(account_code, '\D', '', 'g')) > length(v_parent_code)
    ORDER BY CAST(regexp_replace(account_code, '\D', '', 'g') AS BIGINT) DESC
    LIMIT 1;

    -- Calculate next code
    IF v_max_child_code IS NULL THEN
        RETURN v_parent_code || '0001';
    ELSE
        v_stripped_max := regexp_replace(v_max_child_code, '\D', '', 'g');
        v_next_numeric := CAST(v_stripped_max AS BIGINT) + 1;
        -- Use LPAD to strictly preserve any leading zeros
        RETURN LPAD(CAST(v_next_numeric AS TEXT), length(v_stripped_max), '0');
    END IF;
END;
$$ LANGUAGE plpgsql;
