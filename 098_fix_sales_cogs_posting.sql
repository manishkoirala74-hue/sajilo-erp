-- 1. Redefine rpc_checkout_sales_invoice to inject COGS and Inventory GL lines
CREATE OR REPLACE FUNCTION rpc_checkout_sales_invoice(p_payload JSONB, p_idempotency_key UUID, p_gl_lines JSONB)
RETURNS JSONB AS $$
DECLARE
    v_invoice_id UUID;
    v_journal_id UUID;
    v_company_id UUID;
    v_invoice_date DATE;
    v_invoice_number VARCHAR;
    v_notes VARCHAR;
    v_item JSONB;
    v_item_id UUID;
    v_quantity NUMERIC;
    v_cost_at_sale NUMERIC;
    v_cogs_acc UUID;
    v_inv_acc UUID;
    v_is_physical BOOLEAN;
BEGIN
    IF p_idempotency_key IS NOT NULL THEN
        INSERT INTO public."TransactionLocks" (idempotency_key) VALUES (p_idempotency_key);
    END IF;

    v_company_id := (p_payload->>'company_id')::UUID;
    v_invoice_date := (p_payload->>'invoice_date')::DATE;
    v_invoice_number := p_payload->>'invoice_number';
    v_notes := COALESCE(p_payload->>'notes', 'Sales Invoice ' || v_invoice_number);

    -- Calculate COGS and Inventory lines for each physical item sold
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'line_items')
    LOOP
        v_item_id := NULLIF(TRIM(v_item->>'item_id'), '')::UUID;
        v_quantity := COALESCE((v_item->>'quantity')::NUMERIC, 0);
        
        IF v_item_id IS NOT NULL AND v_quantity > 0 THEN
            SELECT is_physical, COALESCE(current_unit_cost, weighted_average_cost, 0)
            INTO v_is_physical, v_cost_at_sale 
            FROM "Item" 
            WHERE id = v_item_id;

            IF v_is_physical AND v_cost_at_sale > 0 THEN
                v_cogs_acc := resolve_item_gl_account_rpc(v_company_id, v_item_id, 'cogs');
                v_inv_acc := resolve_item_gl_account_rpc(v_company_id, v_item_id, 'inventory');
                
                IF v_cogs_acc IS NOT NULL AND v_inv_acc IS NOT NULL THEN
                    p_gl_lines := p_gl_lines || jsonb_build_object(
                        'account_id', v_cogs_acc, 
                        'account_category', 'cogs', 
                        'debit_amount', v_quantity * v_cost_at_sale, 
                        'credit_amount', 0,
                        'description', 'COGS for ' || v_invoice_number
                    );
                    p_gl_lines := p_gl_lines || jsonb_build_object(
                        'account_id', v_inv_acc, 
                        'account_category', 'inventory', 
                        'debit_amount', 0, 
                        'credit_amount', v_quantity * v_cost_at_sale,
                        'description', 'Inventory Out for ' || v_invoice_number
                    );
                END IF;
            END IF;
        END IF;
    END LOOP;

    v_invoice_id := rpc_internal_save_sales_invoice(p_payload);
    PERFORM rpc_internal_deduct_stock(v_company_id, v_invoice_id);
    v_journal_id := rpc_commit_journal_entry_internal(
        v_company_id, v_invoice_date, v_notes,
        'SalesInvoice', v_invoice_id, 'SalesInvoice', v_invoice_number, p_gl_lines
    );

    RETURN jsonb_build_object('status', 'success', 'invoice_id', v_invoice_id, 'journal_id', v_journal_id);
EXCEPTION 
    WHEN unique_violation THEN
        RAISE EXCEPTION 'ERR_IDEMPOTENCY: This transaction has already been processed.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;


-- 2. Retroactively fix all Sales Invoices that are missing COGS and clean up old duplicates
DO $$
DECLARE
    v_invoice RECORD;
    v_item JSONB;
    v_item_id UUID;
    v_quantity NUMERIC;
    v_cost_at_sale NUMERIC;
    v_cogs_acc UUID;
    v_inv_acc UUID;
    v_is_physical BOOLEAN;
    v_cogs_amount NUMERIC;
    v_journal UUID;
    v_cogs_accounts UUID[];
    v_inv_accounts UUID[];
BEGIN
    -- Get COGS and Inventory account IDs to clean up messy duplicates from old bugs
    SELECT array_agg(id) INTO v_cogs_accounts FROM "ChartOfAccount" WHERE account_code IN ('5100', '5000');
    SELECT array_agg(id) INTO v_inv_accounts FROM "ChartOfAccount" WHERE account_code = '1140';

    FOR v_invoice IN 
        SELECT si.id, si.company_id, si.invoice_number, si.line_items, j.id as journal_id 
        FROM "SalesInvoice" si
        JOIN "GeneralLedgerJournal" j ON j.source_document_id::text = si.id::text AND j.source_document_type = 'SalesInvoice'
    LOOP
        v_journal := v_invoice.journal_id;
        
        -- Safely delete ANY existing COGS or Inventory lines in this SalesInvoice journal 
        -- to prevent double-counting and ensure a completely clean slate.
        DELETE FROM "GeneralLedgerLine" 
        WHERE journal_id = v_journal 
        AND account_id = ANY(v_cogs_accounts || v_inv_accounts);
        
        -- Calculate accurate COGS from scratch
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_invoice.line_items)
        LOOP
            v_item_id := NULLIF(TRIM(v_item->>'item_id'), '')::UUID;
            v_quantity := COALESCE((v_item->>'quantity')::NUMERIC, 0);
            
            IF v_item_id IS NOT NULL AND v_quantity > 0 THEN
                SELECT is_physical, COALESCE(current_unit_cost, weighted_average_cost, 0)
                INTO v_is_physical, v_cost_at_sale 
                FROM "Item" 
                WHERE id = v_item_id;

                IF v_is_physical AND v_cost_at_sale > 0 THEN
                    v_cogs_acc := resolve_item_gl_account_rpc(v_invoice.company_id, v_item_id, 'cogs');
                    v_inv_acc := resolve_item_gl_account_rpc(v_invoice.company_id, v_item_id, 'inventory');
                    
                    IF v_cogs_acc IS NOT NULL AND v_inv_acc IS NOT NULL THEN
                        v_cogs_amount := v_quantity * v_cost_at_sale;
                        
                        -- Insert COGS (Debit)
                        INSERT INTO "GeneralLedgerLine" (
                            company_id, journal_id, account_id, debit_amount, credit_amount, description
                        ) VALUES (
                            v_invoice.company_id, v_journal, v_cogs_acc, v_cogs_amount, 0, 'COGS for ' || v_invoice.invoice_number
                        );
                        
                        -- Insert Inventory Out (Credit)
                        INSERT INTO "GeneralLedgerLine" (
                            company_id, journal_id, account_id, debit_amount, credit_amount, description
                        ) VALUES (
                            v_invoice.company_id, v_journal, v_inv_acc, 0, v_cogs_amount, 'Inventory Out for ' || v_invoice.invoice_number
                        );
                    END IF;
                END IF;
            END IF;
        END LOOP;
        
        -- Re-calculate journal totals
        UPDATE "GeneralLedgerJournal"
        SET 
            total_debit = (SELECT SUM(debit_amount) FROM "GeneralLedgerLine" WHERE journal_id = v_journal),
            total_credit = (SELECT SUM(credit_amount) FROM "GeneralLedgerLine" WHERE journal_id = v_journal)
        WHERE id = v_journal;
            
    END LOOP;
END;
$$ LANGUAGE plpgsql;
