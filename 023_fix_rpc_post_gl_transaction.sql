CREATE OR REPLACE FUNCTION rpc_post_gl_transaction(
    p_company_id UUID,
    p_date DATE,
    p_description TEXT,
    p_module TEXT,
    p_source_id UUID,
    p_source_type TEXT,
    p_lines JSONB,
    p_is_reversal BOOLEAN DEFAULT false,
    p_lock_cogs BOOLEAN DEFAULT false,
    p_voucher_no TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_journal_id UUID;
    v_line JSONB;
    v_item_id UUID;
    v_cost_at_sale NUMERIC;
    v_total_debit NUMERIC := 0;
    v_total_credit NUMERIC := 0;
    v_dr NUMERIC;
    v_cr NUMERIC;
    v_cogs_acc UUID;
    v_inv_acc UUID;
    v_qty NUMERIC;
    v_entity_type TEXT;
    v_entity_id UUID;
    v_due_date DATE;
    v_resolved_account_id UUID;
BEGIN
    -- 1. Create the Journal Header
    INSERT INTO "GeneralLedgerJournal" (
        company_id, entry_date, description, reference_module, 
        source_document_id, source_document_type, status, total_debit, total_credit, is_balanced, voucher_no
    ) VALUES (
        p_company_id, p_date, p_description, p_module, 
        p_source_id, p_source_type, 'Posted', 0, 0, false, p_voucher_no
    ) RETURNING id INTO v_journal_id;

    -- 2. Process all lines
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
        v_dr := COALESCE((v_line->>'debit_amount')::NUMERIC, 0);
        v_cr := COALESCE((v_line->>'credit_amount')::NUMERIC, 0);
        v_entity_type := v_line->>'entity_type';
        
        BEGIN
            v_entity_id := (v_line->>'entity_id')::UUID;
        EXCEPTION WHEN OTHERS THEN
            v_entity_id := NULL;
        END;
        
        BEGIN
            v_due_date := (v_line->>'due_date')::DATE;
        EXCEPTION WHEN OTHERS THEN
            v_due_date := p_date;
        END;

        -- Resolve Account ID using account_category if account_id is not explicitly provided
        IF (v_line->>'account_id') IS NOT NULL THEN
            v_resolved_account_id := (v_line->>'account_id')::UUID;
        ELSIF (v_line->>'account_category') IS NOT NULL AND (v_line->>'item_id') IS NOT NULL THEN
            v_resolved_account_id := resolve_item_gl_account_rpc(p_company_id, (v_line->>'item_id')::UUID, (v_line->>'account_category'));
        ELSE
            v_resolved_account_id := NULL;
        END IF;

        -- Insert normal line
        IF v_dr > 0 OR v_cr > 0 THEN
            INSERT INTO "GeneralLedgerLine" (
                journal_id, account_id, account_code, account_name, account_type,
                debit_amount, credit_amount, description, entity_type, entity_id, due_date
            ) VALUES (
                v_journal_id, 
                v_resolved_account_id, 
                v_line->>'account_code', 
                v_line->>'account_name', 
                v_line->>'account_type',
                v_dr, v_cr, 
                COALESCE(v_line->>'description', p_description),
                v_entity_type, v_entity_id, COALESCE(v_due_date, p_date)
            );
            v_total_debit := v_total_debit + v_dr;
            v_total_credit := v_total_credit + v_cr;
        END IF;

        -- 3. Lock COGS and auto-generate COGS/Inventory Lines if requested
        IF p_lock_cogs = true AND (v_line->>'item_id') IS NOT NULL AND (v_line->>'is_physical')::BOOLEAN = true THEN
            v_item_id := (v_line->>'item_id')::UUID;
            v_qty := (v_line->>'quantity')::NUMERIC;
            
            -- Reversal uses exact historical cost, Normal post locks current cost
            IF p_is_reversal THEN
                v_cost_at_sale := COALESCE((v_line->>'cost_at_sale')::NUMERIC, 0);
            ELSE
                SELECT COALESCE(current_unit_cost, weighted_average_cost, 0) 
                INTO v_cost_at_sale 
                FROM "Item" WHERE id = v_item_id FOR SHARE; -- Read lock
            END IF;

            v_cogs_acc := resolve_item_gl_account_rpc(p_company_id, v_item_id, 'cogs');
            v_inv_acc := resolve_item_gl_account_rpc(p_company_id, v_item_id, 'inventory');

            IF v_cogs_acc IS NOT NULL AND v_inv_acc IS NOT NULL AND v_cost_at_sale > 0 THEN
                IF p_is_reversal THEN
                    -- Reverse: DR Inventory, CR COGS
                    INSERT INTO "GeneralLedgerLine" (journal_id, account_id, debit_amount, credit_amount, description) 
                    VALUES (v_journal_id, v_inv_acc, (v_qty * v_cost_at_sale), 0, 'Return in: ' || (v_line->>'item_name'));
                    
                    INSERT INTO "GeneralLedgerLine" (journal_id, account_id, debit_amount, credit_amount, description) 
                    VALUES (v_journal_id, v_cogs_acc, 0, (v_qty * v_cost_at_sale), 'COGS reversal: ' || (v_line->>'item_name'));
                ELSE
                    -- Normal: DR COGS, CR Inventory
                    INSERT INTO "GeneralLedgerLine" (journal_id, account_id, debit_amount, credit_amount, description) 
                    VALUES (v_journal_id, v_cogs_acc, (v_qty * v_cost_at_sale), 0, 'COGS: ' || (v_line->>'item_name'));
                    
                    INSERT INTO "GeneralLedgerLine" (journal_id, account_id, debit_amount, credit_amount, description) 
                    VALUES (v_journal_id, v_inv_acc, 0, (v_qty * v_cost_at_sale), 'Inventory out: ' || (v_line->>'item_name'));
                END IF;

                v_total_debit := v_total_debit + (v_qty * v_cost_at_sale);
                v_total_credit := v_total_credit + (v_qty * v_cost_at_sale);
            END IF;
        END IF;

    END LOOP;

    -- 4. Finalize Journal Header
    UPDATE "GeneralLedgerJournal"
    SET total_debit = v_total_debit,
        total_credit = v_total_credit,
        is_balanced = (ABS(v_total_debit - v_total_credit) < 0.01)
    WHERE id = v_journal_id;

    RETURN v_journal_id;
END;
$$ LANGUAGE plpgsql;
