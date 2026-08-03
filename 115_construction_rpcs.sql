-- 115_construction_rpcs.sql
-- RPCs for Construction Management Module

SET search_path = public, pg_temp;

-- 1. Issue Project Materials (Delivery Challan)
CREATE OR REPLACE FUNCTION rpc_issue_project_materials(p_payload JSONB)
RETURNS UUID AS $$
DECLARE
    v_company_id UUID;
    v_user_id UUID;
    v_challan_id UUID;
    v_voucher_no TEXT;
    v_seq_record RECORD;
    v_line JSONB;
    v_item_id UUID;
    v_qty NUMERIC;
    v_godown_id TEXT;
    v_rate NUMERIC;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED: Must be logged in.';
    END IF;

    v_company_id := NULLIF(TRIM(p_payload->>'company_id'), '')::UUID;
    v_godown_id := p_payload->>'godown_id';

    -- Generate Voucher Number from DocumentSequence
    SELECT * INTO v_seq_record FROM "DocumentSequence" 
    WHERE company_id = v_company_id AND document_type = 'DeliveryChallan'
    FOR UPDATE;

    IF NOT FOUND THEN
        v_voucher_no := 'CHL-1';
        INSERT INTO "DocumentSequence" (company_id, document_type, prefix, next_number)
        VALUES (v_company_id, 'DeliveryChallan', 'CHL-', 2);
    ELSE
        v_voucher_no := COALESCE(v_seq_record.prefix, '') || v_seq_record.next_number || COALESCE(v_seq_record.suffix, '');
        UPDATE "DocumentSequence" 
        SET next_number = next_number + 1 
        WHERE id = v_seq_record.id;
    END IF;

    v_challan_id := gen_random_uuid();

    -- Insert Header
    INSERT INTO "DeliveryChallan" (
        id, company_id, project_id, godown_id, issue_date, voucher_no, billing_status, created_by
    ) VALUES (
        v_challan_id, v_company_id, NULLIF(TRIM(p_payload->>'project_id'), '')::UUID, NULLIF(TRIM(v_godown_id), '')::UUID, 
        (p_payload->>'issue_date')::DATE, v_voucher_no, 'Unbilled', v_user_id::TEXT
    );

    -- Insert Lines and Deduct Stock
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_payload->'line_items')
    LOOP
        v_item_id := NULLIF(TRIM(v_line->>'item_id'), '')::UUID;
        v_qty := (v_line->>'quantity')::NUMERIC;
        
        -- Get current WAC to store as rate
        SELECT weighted_average_cost INTO v_rate FROM "Item" WHERE id = v_item_id;
        v_rate := COALESCE(v_rate, 0);

        INSERT INTO "DeliveryChallanLine" (
            company_id, challan_id, item_id, quantity, rate, created_by
        ) VALUES (
            v_company_id, v_challan_id, v_item_id, v_qty, v_rate, v_user_id::TEXT
        );

        -- Deduct from InventoryLedger (quantity_out)
        INSERT INTO "InventoryLedger" (
            company_id, item_id, transaction_type, godown_id, 
            quantity_in, quantity_out, transaction_date, reference_id, reference_type
        ) VALUES (
            v_company_id, v_item_id, 'DeliveryChallan', NULLIF(v_godown_id, '')::UUID,
            0, v_qty, (p_payload->>'issue_date')::TIMESTAMP WITH TIME ZONE, v_challan_id, 'DeliveryChallan'
        );

        -- Note: We assume a trigger or separate RPC syncs Item.quantity_on_hand
    END LOOP;

    RETURN v_challan_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Lock down function
REVOKE EXECUTE ON FUNCTION rpc_issue_project_materials(JSONB) FROM public, anon;
GRANT EXECUTE ON FUNCTION rpc_issue_project_materials(JSONB) TO authenticated, service_role;


-- 2. Cancel Delivery Challan
CREATE OR REPLACE FUNCTION rpc_cancel_delivery_challan(p_challan_id UUID, p_reason TEXT)
RETURNS VOID AS $$
DECLARE
    v_user_id UUID;
    v_status TEXT;
    v_company_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED: Must be logged in.';
    END IF;

    SELECT billing_status, company_id INTO v_status, v_company_id FROM "DeliveryChallan" WHERE id = p_challan_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ERR_NOT_FOUND: Challan not found.';
    END IF;
    IF v_status = 'Billed' THEN
        RAISE EXCEPTION 'ERR_ALREADY_BILLED: Cannot cancel a billed challan. Cancel the invoice first.';
    END IF;
    IF v_status = 'Cancelled' THEN
        RETURN; -- Idempotent
    END IF;

    -- Update status
    UPDATE "DeliveryChallan" SET billing_status = 'Cancelled', updated_by = v_user_id::TEXT, updated_at = NOW() WHERE id = p_challan_id;

    -- Inventory Reversal (Append-Only standard: create stock contra-entries)
    INSERT INTO "InventoryLedger" (
        company_id, item_id, transaction_type, godown_id, 
        quantity_in, quantity_out, transaction_date, reference_id, reference_type
    )
    SELECT 
        company_id, item_id, 'DeliveryChallan_Cancel', godown_id, 
        quantity_out, -- Swapped to negate movement
        0,  
        CURRENT_TIMESTAMP, reference_id, reference_type 
    FROM "InventoryLedger"
    WHERE reference_id = p_challan_id AND reference_type = 'DeliveryChallan';

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Lock down function
REVOKE EXECUTE ON FUNCTION rpc_cancel_delivery_challan(UUID, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION rpc_cancel_delivery_challan(UUID, TEXT) TO authenticated, service_role;


-- 3. Consolidate Challans to Invoice
CREATE OR REPLACE FUNCTION rpc_consolidate_challans_to_invoice(p_project_id UUID, p_payload JSONB)
RETURNS UUID AS $$
DECLARE
    v_user_id UUID;
    v_company_id UUID;
    v_invoice_id UUID;
    v_challan_id UUID;
    v_challan_ids UUID[];
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED: Must be logged in.';
    END IF;

    v_company_id := NULLIF(TRIM(p_payload->>'company_id'), '')::UUID;

    -- Fetch and lock Unbilled Challans for this project to prevent race conditions
    SELECT array_agg(id) INTO v_challan_ids
    FROM "DeliveryChallan"
    WHERE project_id = p_project_id AND billing_status = 'Unbilled'
    FOR UPDATE;

    IF v_challan_ids IS NULL OR array_length(v_challan_ids, 1) = 0 THEN
        RAISE EXCEPTION 'ERR_NO_UNBILLED_CHALLANS: No unbilled challans found for this project.';
    END IF;

    -- Call standard sales invoice creation (assuming rpc_unified_checkout exists, bypassing inventory)
    -- As per V4 Plan: "explicitly pass a flag to bypass standard inventory deduction logic"
    -- We assume the payload already has the structured line items for the invoice.
    
    -- Inject the bypass flag forcefully at the database level
    p_payload := jsonb_set(p_payload, '{is_from_challan}', 'true'::jsonb);

    -- Now call unified checkout to handle Invoice saving AND General Ledger, 
    -- passing the idempotency_key and gl_lines from the payload if present.
    -- (The modified rpc_checkout_sales_invoice will catch the flag and bypass inventory).
    v_invoice_id := (public.rpc_checkout_sales_invoice(
        p_payload, 
        NULLIF(TRIM(p_payload->>'idempotency_key'), '')::UUID, 
        p_payload->'gl_lines'
    )->>'invoice_id')::UUID;
    
    -- Update Challans to Billed
    UPDATE "DeliveryChallan"
    SET billing_status = 'Billed', linked_invoice_id = v_invoice_id, updated_at = NOW(), updated_by = v_user_id::TEXT
    WHERE id = ANY(v_challan_ids);
    
    -- Update lines billed quantity
    UPDATE "DeliveryChallanLine"
    SET billed_quantity = quantity, updated_at = NOW(), updated_by = v_user_id::TEXT
    WHERE challan_id = ANY(v_challan_ids);

    RETURN v_invoice_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Lock down function
REVOKE EXECUTE ON FUNCTION rpc_consolidate_challans_to_invoice(UUID, JSONB) FROM public, anon;
GRANT EXECUTE ON FUNCTION rpc_consolidate_challans_to_invoice(UUID, JSONB) TO authenticated, service_role;
