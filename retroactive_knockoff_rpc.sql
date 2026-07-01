CREATE OR REPLACE FUNCTION rpc_retroactive_bill_knockoff(
    p_company_id UUID,
    p_type TEXT,
    p_allocations JSONB
) RETURNS void AS $$
DECLARE
    alloc RECORD;
    v_invoice_id UUID;
    v_voucher_id UUID;
    v_alloc_amt NUMERIC;
    
    v_inv_total NUMERIC;
    v_inv_paid NUMERIC;
    v_new_paid NUMERIC;
    
    v_voucher_allocs JSONB;
    v_found BOOLEAN;
    v_elem JSONB;
    v_new_allocs JSONB;
    v_inv_number TEXT;
    v_inv_date DATE;
BEGIN
    FOR alloc IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
        v_invoice_id := (alloc.value->>'invoice_id')::UUID;
        v_voucher_id := (alloc.value->>'voucher_id')::UUID;
        v_alloc_amt := (alloc.value->>'allocated_amount')::NUMERIC;
        
        IF p_type = 'Customer' THEN
            -- Update SalesInvoice
            SELECT grand_total, COALESCE(paid_amount, 0), invoice_number, invoice_date INTO v_inv_total, v_inv_paid, v_inv_number, v_inv_date 
            FROM "SalesInvoice" WHERE id = v_invoice_id AND company_id = p_company_id;
            
            v_new_paid := v_inv_paid + v_alloc_amt;
            
            UPDATE "SalesInvoice" 
            SET paid_amount = v_new_paid,
                payment_status = CASE WHEN v_new_paid >= grand_total THEN 'Paid' ELSE 'Partial' END
            WHERE id = v_invoice_id;
        ELSE
            -- Update PurchaseInvoice
            SELECT grand_total, COALESCE(paid_amount, 0), invoice_number, invoice_date INTO v_inv_total, v_inv_paid, v_inv_number, v_inv_date 
            FROM "PurchaseInvoice" WHERE id = v_invoice_id AND company_id = p_company_id;
            
            v_new_paid := v_inv_paid + v_alloc_amt;
            
            UPDATE "PurchaseInvoice" 
            SET paid_amount = v_new_paid,
                payment_status = CASE WHEN v_new_paid >= grand_total THEN 'Paid' ELSE 'Partial' END
            WHERE id = v_invoice_id;
        END IF;
        
        -- Update FinancialVoucher
        SELECT COALESCE(bill_allocations, '[]'::jsonb) INTO v_voucher_allocs 
        FROM "FinancialVoucher" WHERE id = v_voucher_id AND company_id = p_company_id;
        
        v_found := false;
        v_new_allocs := '[]'::jsonb;
        
        -- Try to update existing allocation if it exists
        IF jsonb_typeof(v_voucher_allocs) = 'array' THEN
            FOR v_elem IN SELECT * FROM jsonb_array_elements(v_voucher_allocs) LOOP
                IF (v_elem->>'invoice_id') = v_invoice_id::text THEN
                    v_elem := jsonb_set(v_elem, '{allocated_amount}', to_jsonb((v_elem->>'allocated_amount')::NUMERIC + v_alloc_amt));
                    v_found := true;
                END IF;
                v_new_allocs := v_new_allocs || v_elem;
            END LOOP;
        END IF;
        
        IF NOT v_found THEN
            -- Append new allocation object
            v_new_allocs := v_new_allocs || jsonb_build_object(
                'invoice_id', v_invoice_id,
                'invoice_number', v_inv_number,
                'invoice_date', v_inv_date,
                'total', v_inv_total,
                'due', v_inv_total - v_inv_paid,
                'allocated_amount', v_alloc_amt
            );
        END IF;
        
        UPDATE "FinancialVoucher"
        SET bill_allocations = v_new_allocs
        WHERE id = v_voucher_id;
        
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
