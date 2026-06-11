-- ==============================================================================
-- 013_stabilize_ledger_rpc.sql
-- Server-Side General Ledger Statement Engine & Immutability Enforcement
-- ==============================================================================

-- 1. ADD VOUCHER NUMBER TO JOURNAL TO PREVENT OPERATIONAL COUPLING
-- ------------------------------------------------------------------------------
ALTER TABLE "GeneralLedgerJournal"
ADD COLUMN IF NOT EXISTS "voucher_no" TEXT;

-- 2. UPDATE POSTING RPC TO CAPTURE VOUCHER NO
-- ------------------------------------------------------------------------------
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
    v_updated_line_items JSONB := '[]'::JSONB;
    v_original_line_items JSONB;
BEGIN
    -- 1. Create the Journal Header
    INSERT INTO "GeneralLedgerJournal" (
        company_id, entry_date, description, reference_module, 
        source_document_id, source_document_type, status, total_debit, total_credit, is_balanced, voucher_no
    ) VALUES (
        p_company_id, p_date, p_description, p_module, 
        p_source_id::TEXT, p_source_type, 'Posted', 0, 0, false, p_voucher_no
    ) RETURNING id INTO v_journal_id;

    -- Fetch original line items if source document exists
    IF p_source_type = 'SalesInvoice' THEN
        SELECT line_items INTO v_original_line_items FROM "SalesInvoice" WHERE id = p_source_id;
    ELSIF p_source_type = 'POSSale' THEN
        SELECT line_items INTO v_original_line_items FROM "POSSale" WHERE id = p_source_id;
    ELSIF p_source_type = 'SalesReturn' THEN
        SELECT line_items INTO v_original_line_items FROM "SalesReturn" WHERE id = p_source_id;
    END IF;

    -- 2. Process all lines
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
        v_dr := COALESCE((v_line->>'debit_amount')::NUMERIC, 0);
        v_cr := COALESCE((v_line->>'credit_amount')::NUMERIC, 0);
        v_entity_type := v_line->>'entity_type';
        
        -- Safe UUID cast handling
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

        -- Insert normal line
        IF v_dr > 0 OR v_cr > 0 THEN
            INSERT INTO "GeneralLedgerLine" (
                company_id, journal_id, account_id, account_code, account_name, account_type,
                debit_amount, credit_amount, description, entity_type, entity_id, due_date
            ) VALUES (
                p_company_id, v_journal_id::TEXT, 
                COALESCE((v_line->>'account_id'), resolve_item_gl_account_rpc(p_company_id, (v_line->>'item_id')::UUID, (v_line->>'account_category'))::TEXT),
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
            
            IF p_is_reversal THEN
                v_cost_at_sale := COALESCE((v_line->>'cost_at_sale')::NUMERIC, 0);
            ELSE
                -- Lock row to prevent race condition during cost reading
                SELECT COALESCE(current_unit_cost, weighted_average_cost, 0) 
                INTO v_cost_at_sale 
                FROM "Item" WHERE id = v_item_id FOR SHARE;
            END IF;

            -- Update JSON array to record frozen cost
            v_line := jsonb_set(v_line, '{cost_at_sale}', to_jsonb(v_cost_at_sale));

            v_cogs_acc := resolve_item_gl_account_rpc(p_company_id, v_item_id, 'cogs');
            v_inv_acc := resolve_item_gl_account_rpc(p_company_id, v_item_id, 'inventory');

            IF v_cogs_acc IS NOT NULL AND v_inv_acc IS NOT NULL AND v_cost_at_sale > 0 THEN
                IF p_is_reversal THEN
                    -- Reverse: DR Inventory, CR COGS
                    INSERT INTO "GeneralLedgerLine" (company_id, journal_id, account_id, debit_amount, credit_amount, description) 
                    VALUES (p_company_id, v_journal_id::TEXT, v_inv_acc::TEXT, (v_qty * v_cost_at_sale), 0, 'Return in: ' || (v_line->>'item_name'));
                    
                    INSERT INTO "GeneralLedgerLine" (company_id, journal_id, account_id, debit_amount, credit_amount, description) 
                    VALUES (p_company_id, v_journal_id::TEXT, v_cogs_acc::TEXT, 0, (v_qty * v_cost_at_sale), 'COGS reversal: ' || (v_line->>'item_name'));
                ELSE
                    -- Normal: DR COGS, CR Inventory
                    INSERT INTO "GeneralLedgerLine" (company_id, journal_id, account_id, debit_amount, credit_amount, description) 
                    VALUES (p_company_id, v_journal_id::TEXT, v_cogs_acc::TEXT, (v_qty * v_cost_at_sale), 0, 'COGS: ' || (v_line->>'item_name'));
                    
                    INSERT INTO "GeneralLedgerLine" (company_id, journal_id, account_id, debit_amount, credit_amount, description) 
                    VALUES (p_company_id, v_journal_id::TEXT, v_inv_acc::TEXT, 0, (v_qty * v_cost_at_sale), 'Inventory out: ' || (v_line->>'item_name'));
                END IF;

                v_total_debit := v_total_debit + (v_qty * v_cost_at_sale);
                v_total_credit := v_total_credit + (v_qty * v_cost_at_sale);
            END IF;
        END IF;

        v_updated_line_items := v_updated_line_items || v_line;
    END LOOP;

    -- Update Source Documents if this is an origin creation
    IF p_lock_cogs = true AND v_original_line_items IS NOT NULL THEN
        IF p_source_type = 'SalesInvoice' THEN
            UPDATE "SalesInvoice" SET line_items = v_updated_line_items WHERE id = p_source_id;
        ELSIF p_source_type = 'POSSale' THEN
            UPDATE "POSSale" SET line_items = v_updated_line_items WHERE id = p_source_id;
        ELSIF p_source_type = 'SalesReturn' THEN
            UPDATE "SalesReturn" SET line_items = v_updated_line_items WHERE id = p_source_id;
        END IF;
    END IF;

    UPDATE "GeneralLedgerJournal"
    SET total_debit = v_total_debit,
        total_credit = v_total_credit,
        is_balanced = (ABS(v_total_debit - v_total_credit) < 0.01)
    WHERE id = v_journal_id;

    RETURN v_journal_id;
END;
$$ LANGUAGE plpgsql;

-- 3. UPDATE REVERSAL RPC TO MAINTAIN IMMUTABILITY
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_reverse_gl_transaction(
    p_company_id UUID,
    p_original_journal_id UUID,
    p_reversal_date DATE,
    p_reason TEXT
) RETURNS UUID AS $$
DECLARE
    v_original "GeneralLedgerJournal"%ROWTYPE;
    v_line "GeneralLedgerLine"%ROWTYPE;
    v_new_journal_id UUID;
    v_rev_voucher_no TEXT;
BEGIN
    SELECT * INTO v_original FROM "GeneralLedgerJournal" WHERE id = p_original_journal_id AND company_id = p_company_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Original journal not found.';
    END IF;

    -- Generate Reversal Voucher Number
    IF v_original.voucher_no IS NOT NULL THEN
        v_rev_voucher_no := v_original.voucher_no || '-REV';
    ELSE
        v_rev_voucher_no := 'REV-' || SUBSTRING(v_original.id::TEXT, 1, 8);
    END IF;

    -- IMPORTANT: We DO NOT update the original journal status to 'Cancelled'
    -- This enforces strict mathematical immutability where the original row remains and is neutralized by the new row

    INSERT INTO "GeneralLedgerJournal" (
        company_id, entry_date, description, reference_module, 
        source_document_id, source_document_type, status, total_debit, total_credit, is_balanced, voucher_no
    ) VALUES (
        p_company_id, p_reversal_date, 'Reversal: ' || v_original.description || ' (' || p_reason || ')', 'Reversal', 
        v_original.source_document_id, v_original.source_document_type, 'Posted', v_original.total_credit, v_original.total_debit, v_original.is_balanced, v_rev_voucher_no
    ) RETURNING id INTO v_new_journal_id;

    FOR v_line IN SELECT * FROM "GeneralLedgerLine" WHERE journal_id = p_original_journal_id::TEXT
    LOOP
        INSERT INTO "GeneralLedgerLine" (
            company_id, journal_id, account_id, account_code, account_name, account_type,
            debit_amount, credit_amount, description, entity_type, entity_id, due_date
        ) VALUES (
            p_company_id, v_new_journal_id::TEXT, v_line.account_id, v_line.account_code, v_line.account_name, v_line.account_type,
            v_line.credit_amount, v_line.debit_amount, 'Reversal: ' || v_line.description, v_line.entity_type, v_line.entity_id, v_line.due_date
        );
    END LOOP;

    RETURN v_new_journal_id;
END;
$$ LANGUAGE plpgsql;


-- 4. CREATE SERVER-SIDE RUNNING BALANCE WINDOW ENGINE
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_stabilized_general_ledger_statement_rpc(
    p_company_id UUID,
    p_account_id UUID,
    p_from_date DATE,
    p_to_date DATE
) RETURNS TABLE (
    id UUID,
    journal_id TEXT,
    entry_date DATE,
    voucher_no TEXT,
    description TEXT,
    debit_amount NUMERIC,
    credit_amount NUMERIC,
    running_balance NUMERIC,
    is_opening BOOLEAN
) LANGUAGE plpgsql AS $$
DECLARE
    v_normal_balance TEXT;
BEGIN
    -- 1. Read strict account behavior dynamically
    SELECT normal_balance INTO v_normal_balance
    FROM "ChartOfAccount"
    WHERE id = p_account_id;

    RETURN QUERY
    WITH historical_agg AS (
        -- Mathematical point-in-time opening balance from beginning of time to from_date - 1
        SELECT 
            SUM(COALESCE(l.debit_amount, 0)) as ob_dr,
            SUM(COALESCE(l.credit_amount, 0)) as ob_cr
        FROM "GeneralLedgerLine" l
        JOIN "GeneralLedgerJournal" j ON l.journal_id = j.id::TEXT
        WHERE l.account_id = p_account_id::TEXT
          AND j.company_id = p_company_id
          AND j.status = 'Posted'
          AND j.entry_date::DATE < p_from_date
    ),
    combined_stream AS (
        -- Row 1: Opening Balance Anchor
        SELECT 
            NULL::UUID as line_id,
            ''::TEXT as journal_id,
            (p_from_date - INTERVAL '1 day')::DATE as entry_date,
            'OPENING_BAL'::TEXT as voucher_no,
            'Opening Balance'::TEXT as description,
            h.ob_dr as debit_amount,
            h.ob_cr as credit_amount,
            TRUE as is_opening,
            0::INTEGER as sort_order
        FROM historical_agg h
        WHERE h.ob_dr > 0 OR h.ob_cr > 0

        UNION ALL

        -- Rows 2..N: Chronological Activity Stream (NO LEFT JOIN TO OPERATIONAL TABLES)
        SELECT 
            l.id::UUID as line_id,
            j.id::TEXT as journal_id,
            j.entry_date::DATE as entry_date,
            COALESCE(j.voucher_no, j.id::TEXT) as voucher_no, 
            COALESCE(l.description, j.description, 'Journal Entry') as description,
            COALESCE(l.debit_amount, 0) as debit_amount,
            COALESCE(l.credit_amount, 0) as credit_amount,
            FALSE as is_opening,
            1::INTEGER as sort_order
        FROM "GeneralLedgerLine" l
        JOIN "GeneralLedgerJournal" j ON l.journal_id = j.id::TEXT
        WHERE l.account_id = p_account_id::TEXT
          AND j.company_id = p_company_id
          AND j.status = 'Posted'
          AND j.entry_date::DATE >= p_from_date
          AND j.entry_date::DATE <= p_to_date
    )
    -- Compute running balance entirely server-side using PostgreSQL Window Functions
    SELECT 
        c.line_id as id,
        c.journal_id,
        c.entry_date,
        c.voucher_no,
        c.description,
        c.debit_amount,
        c.credit_amount,
        SUM(
            CASE 
                WHEN v_normal_balance = 'Debit' THEN (c.debit_amount - c.credit_amount)
                WHEN v_normal_balance = 'Credit' THEN (c.credit_amount - c.debit_amount)
                ELSE (c.debit_amount - c.credit_amount)
            END
        ) OVER (ORDER BY c.sort_order ASC, c.entry_date ASC, c.journal_id ASC, c.line_id ASC) as running_balance,
        c.is_opening
    FROM combined_stream c
    ORDER BY c.sort_order ASC, c.entry_date ASC, c.journal_id ASC, c.line_id ASC;
END;
$$;
-- 5. UPDATE STOCK ADJUSTMENT RPC
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_post_stock_adjustment(
    p_company_id UUID,
    p_adjustment_id UUID,
    p_adjustment_date DATE,
    p_reason TEXT,
    p_lines JSONB,
    p_voucher_no TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_journal_id UUID;
    v_line JSONB;
    v_item_id UUID;
    v_diff_qty NUMERIC;
    v_current_cost NUMERIC;
    v_cost_impact NUMERIC;
    v_inv_acc UUID;
    v_var_acc UUID;
    v_total_debit NUMERIC := 0;
    v_total_credit NUMERIC := 0;
BEGIN
    SELECT gl_stock_variance_account_id::UUID INTO v_var_acc FROM "CompanySettings" WHERE company_id = p_company_id LIMIT 1;
    IF v_var_acc IS NULL THEN
        RAISE EXCEPTION 'ERR_STRICT_ACCOUNT_MAPPING: Missing Stock Variance Account in Company Settings';
    END IF;

    INSERT INTO "GeneralLedgerJournal" (
        company_id, entry_date, description, reference_module, 
        source_document_id, source_document_type, status, total_debit, total_credit, is_balanced, voucher_no
    ) VALUES (
        p_company_id, p_adjustment_date, 'Stock Adjustment — ' || p_reason, 'Stock', 
        p_adjustment_id::TEXT, 'StockAdjustment', 'Posted', 0, 0, false, p_voucher_no
    ) RETURNING id INTO v_journal_id;

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
        v_item_id := (v_line->>'item_id')::UUID;
        v_diff_qty := (v_line->>'difference_qty')::NUMERIC;
        IF v_diff_qty = 0 THEN CONTINUE; END IF;

        -- Strict Row Lock on Item
        SELECT COALESCE(weighted_average_cost, current_unit_cost, 0) INTO v_current_cost
        FROM "Item" WHERE id = v_item_id FOR UPDATE;

        v_cost_impact := ABS(v_diff_qty) * v_current_cost;
        IF v_cost_impact = 0 THEN CONTINUE; END IF;

        v_inv_acc := resolve_item_gl_account_rpc(p_company_id, v_item_id, 'inventory');

        -- Update Item Stock
        UPDATE "Item" SET quantity_on_hand = quantity_on_hand + v_diff_qty WHERE id = v_item_id;

        IF v_diff_qty > 0 THEN
            INSERT INTO "GeneralLedgerLine" (company_id, journal_id, account_id, debit_amount, credit_amount, description) 
            VALUES (p_company_id, v_journal_id::TEXT, v_inv_acc::TEXT, v_cost_impact, 0, 'Stock up: ' || (v_line->>'item_name'));
            INSERT INTO "GeneralLedgerLine" (company_id, journal_id, account_id, debit_amount, credit_amount, description) 
            VALUES (p_company_id, v_journal_id::TEXT, v_var_acc::TEXT, 0, v_cost_impact, 'Stock up: ' || (v_line->>'item_name'));
        ELSE
            INSERT INTO "GeneralLedgerLine" (company_id, journal_id, account_id, debit_amount, credit_amount, description) 
            VALUES (p_company_id, v_journal_id::TEXT, v_var_acc::TEXT, v_cost_impact, 0, 'Stock down: ' || (v_line->>'item_name'));
            INSERT INTO "GeneralLedgerLine" (company_id, journal_id, account_id, debit_amount, credit_amount, description) 
            VALUES (p_company_id, v_journal_id::TEXT, v_inv_acc::TEXT, 0, v_cost_impact, 'Stock down: ' || (v_line->>'item_name'));
        END IF;

        v_total_debit := v_total_debit + v_cost_impact;
        v_total_credit := v_total_credit + v_cost_impact;
    END LOOP;

    UPDATE "GeneralLedgerJournal"
    SET total_debit = v_total_debit, total_credit = v_total_credit, is_balanced = (ABS(v_total_debit - v_total_credit) < 0.01)
    WHERE id = v_journal_id;

    RETURN v_journal_id;
END;
$$ LANGUAGE plpgsql;
