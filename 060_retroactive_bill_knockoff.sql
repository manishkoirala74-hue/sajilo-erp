CREATE OR REPLACE FUNCTION rpc_retroactive_bill_knockoff(
    p_company_id UUID,
    p_type TEXT,
    p_allocations JSONB
) RETURNS JSONB AS $$
DECLARE
    alloc_record RECORD;
    v_invoice_id UUID;
    v_voucher_id UUID;
    v_alloc_amount NUMERIC;
    v_inv_record RECORD;
    v_voucher_record RECORD;
    v_new_paid NUMERIC;
    v_new_status TEXT;
    v_new_alloc JSONB;
BEGIN
    FOR alloc_record IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
        v_invoice_id := (alloc_record.value->>'invoice_id')::UUID;
        v_voucher_id := (alloc_record.value->>'voucher_id')::UUID;
        v_alloc_amount := (alloc_record.value->>'allocated_amount')::NUMERIC;
        
        -- Lock voucher
        SELECT * INTO v_voucher_record FROM "FinancialVoucher" WHERE id = v_voucher_id AND company_id = p_company_id FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Voucher % not found', v_voucher_id;
        END IF;
        
        -- Lock invoice
        IF p_type = 'Customer' THEN
            SELECT * INTO v_inv_record FROM "SalesInvoice" WHERE id = v_invoice_id AND company_id = p_company_id FOR UPDATE;
        ELSIF p_type = 'Supplier' THEN
            SELECT * INTO v_inv_record FROM "PurchaseInvoice" WHERE id = v_invoice_id AND company_id = p_company_id FOR UPDATE;
        ELSE
            RAISE EXCEPTION 'Invalid type %', p_type;
        END IF;
        
        IF v_inv_record IS NULL THEN
            RAISE EXCEPTION 'Invoice % not found', v_invoice_id;
        END IF;
        
        -- Build the allocation detail
        v_new_alloc := jsonb_build_object(
            'invoice_id', v_invoice_id,
            'invoice_number', v_inv_record.invoice_number,
            'invoice_date', v_inv_record.invoice_date,
            'total', v_inv_record.grand_total,
            'due', COALESCE(v_inv_record.grand_total, 0) - COALESCE(v_inv_record.paid_amount, 0),
            'allocated_amount', v_alloc_amount
        );
        
        -- Update voucher
        UPDATE "FinancialVoucher"
        SET bill_allocations = COALESCE(
            CASE 
                WHEN jsonb_typeof(bill_allocations) = 'array' THEN bill_allocations
                WHEN bill_allocations IS NOT NULL THEN jsonb_build_array(bill_allocations)
                ELSE '[]'::jsonb
            END, '[]'::jsonb
        ) || COALESCE(jsonb_build_array(v_new_alloc), '[]'::jsonb)
        WHERE id = v_voucher_id;
        
        -- Update invoice
        v_new_paid := COALESCE(v_inv_record.paid_amount, 0) + v_alloc_amount;
        IF v_new_paid >= v_inv_record.grand_total THEN
            v_new_status := 'Paid';
        ELSIF v_new_paid > 0 THEN
            v_new_status := 'Partial Paid';
        ELSE
            v_new_status := 'Unpaid';
        END IF;
        
        IF p_type = 'Customer' THEN
            UPDATE "SalesInvoice" SET paid_amount = v_new_paid, payment_status = v_new_status WHERE id = v_invoice_id;
        ELSIF p_type = 'Supplier' THEN
            UPDATE "PurchaseInvoice" SET paid_amount = v_new_paid, payment_status = v_new_status WHERE id = v_invoice_id;
        END IF;
    END LOOP;
    
    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
