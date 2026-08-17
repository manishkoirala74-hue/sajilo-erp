-- ==============================================================================
-- 075_rpc_create_tax_type.sql
-- Creates an atomic database function (RPC) to generate a TaxType along with 
-- an optional auto-generated GL Sub-Ledger in a single, un-breakable transaction.
-- This ensures strict ACID compliance and eliminates the possibility of orphaned
-- ledgers due to frontend network drops or downstream RLS validations.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.create_tax_with_ledger(
  p_tax_payload JSONB,
  p_ledger_payload JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER -- Crucial: runs as the user to enforce standard RLS policies
SET search_path = public
AS $$
DECLARE
  v_ledger_id UUID;
  v_ledger_name TEXT;
  v_tax_record RECORD;
BEGIN
  -- 1. Create Ledger if requested
  IF p_ledger_payload IS NOT NULL THEN
    DECLARE
      v_parent_id UUID := (p_ledger_payload->>'parent_account_id')::UUID;
      v_next_code TEXT;
    BEGIN
      -- Fetch the unique, sequential account code concurrently via existing RPC
      SELECT public.get_next_account_code(v_parent_id) INTO v_next_code;

      INSERT INTO "ChartOfAccount" (
        company_id,
        account_code,
        account_name,
        account_type,
        account_subtype,
        ledger_type,
        parent_account_id,
        parent_account_name,
        normal_balance,
        statement_type,
        statement_group,
        is_active,
        is_system_account,
        current_balance,
        description
      ) VALUES (
        (p_ledger_payload->>'company_id')::UUID,
        v_next_code,
        p_ledger_payload->>'account_name',
        p_ledger_payload->>'account_type',
        p_ledger_payload->>'account_subtype',
        'Sub Ledger',
        v_parent_id,
        p_ledger_payload->>'parent_account_name',
        p_ledger_payload->>'normal_balance',
        p_ledger_payload->>'statement_type',
        p_ledger_payload->>'statement_group',
        true,
        false,
        COALESCE(NULLIF(p_ledger_payload->>'current_balance', '')::NUMERIC, 0),
        p_ledger_payload->>'description'
      ) RETURNING id, account_name INTO v_ledger_id, v_ledger_name;
    END;
    
    -- Dynamically inject the newly created ledger details into the tax payload
    p_tax_payload := jsonb_set(p_tax_payload, '{gl_account_id}', to_jsonb(v_ledger_id));
    p_tax_payload := jsonb_set(p_tax_payload, '{gl_account_name}', to_jsonb(v_ledger_name));
  END IF;

  -- 2. Create TaxType
  INSERT INTO "TaxType" (
    company_id,
    tax_name,
    tax_code,
    tax_rate,
    tax_type,
    applies_to,
    sort_order,
    is_compound,
    gl_account_id,
    gl_account_name,
    is_default,
    is_active,
    description
  ) VALUES (
    (p_tax_payload->>'company_id')::UUID,
    p_tax_payload->>'tax_name',
    p_tax_payload->>'tax_code',
    NULLIF(p_tax_payload->>'tax_rate', '')::NUMERIC,
    p_tax_payload->>'tax_type',
    p_tax_payload->>'applies_to',
    COALESCE(NULLIF(p_tax_payload->>'sort_order', '')::INT, 0),
    COALESCE(NULLIF(p_tax_payload->>'is_compound', '')::BOOLEAN, false),
    NULLIF(p_tax_payload->>'gl_account_id', '')::UUID,
    p_tax_payload->>'gl_account_name',
    COALESCE(NULLIF(p_tax_payload->>'is_default', '')::BOOLEAN, false),
    COALESCE(NULLIF(p_tax_payload->>'is_active', '')::BOOLEAN, true),
    p_tax_payload->>'description'
  ) RETURNING * INTO v_tax_record;

  -- Return the created tax record as a JSON object
  RETURN row_to_json(v_tax_record)::jsonb;
END;
$$;
