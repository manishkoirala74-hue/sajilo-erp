BEGIN;

-- Enable pgTAP
CREATE EXTENSION IF NOT EXISTS pgtap;

-- Plan the number of tests
SELECT plan(6);

-- ==========================================
-- SETUP: Fetch existing valid IDs to use in tests
-- ==========================================
DO $$
DECLARE
    v_company_id UUID;
    v_godown_id UUID;
    v_customer_id UUID;
    v_item_physical UUID;
    v_item_service UUID;
    v_payload_physical JSONB;
    v_payload_service JSONB;
    v_invoice_res JSONB;
    v_journal_id UUID;
    v_line_count INT;
    v_cogs_amount NUMERIC;
    v_valid_date DATE;
    v_customer_name TEXT;
    v_ar_acc UUID;
    v_sales_acc UUID;
    v_gl_lines_physical JSONB;
    v_gl_lines_service JSONB;
BEGIN
    -- 1. Grab a valid Company that actively exists AND has a Fiscal Year
    SELECT c.id, fy.start_date + interval '1 day' 
    INTO v_company_id, v_valid_date 
    FROM "Company" c
    JOIN "FiscalYear" fy ON fy.company_id = c.id
    WHERE fy.is_active = true 
    LIMIT 1;

    IF v_company_id IS NULL THEN
        RAISE EXCEPTION 'CRITICAL_TEST_FAILURE: No active Fiscal Year found in the database.';
    END IF;

    -- 2. Grab related entities strictly for this company
    SELECT id INTO v_godown_id FROM "Godown" WHERE company_id = v_company_id LIMIT 1;
    SELECT id, name INTO v_customer_id, v_customer_name FROM "BusinessPartner" WHERE is_customer = true AND company_id = v_company_id LIMIT 1;
    
    -- Fallbacks to prevent NOT NULL constraint violations if staging data is incomplete
    IF v_customer_name IS NULL THEN
        v_customer_name := 'Walk-in Customer';
    END IF;
    
    -- Grab one physical item and one service item
    SELECT id INTO v_item_physical FROM "Item" WHERE is_physical = true AND company_id = v_company_id LIMIT 1;
    SELECT id INTO v_item_service FROM "Item" WHERE is_physical = false AND company_id = v_company_id LIMIT 1;
    
    -- Grab valid AR and Sales accounts to simulate the frontend payload
    SELECT id INTO v_ar_acc FROM "ChartOfAccount" WHERE ledger_type = 'Sub Ledger' AND (account_type ILIKE '%receivable%' OR account_name ILIKE '%receivable%' OR account_type ILIKE '%asset%') AND company_id = v_company_id LIMIT 1;
    SELECT id INTO v_sales_acc FROM "ChartOfAccount" WHERE ledger_type = 'Sub Ledger' AND (account_type ILIKE '%revenue%' OR account_type ILIKE '%income%' OR account_name ILIKE '%sales%') AND company_id = v_company_id LIMIT 1;
    
    IF v_ar_acc IS NULL OR v_sales_acc IS NULL THEN
        RAISE EXCEPTION 'CRITICAL_TEST_FAILURE: Company lacks Chart of Accounts needed for test.';
    END IF;

    -- Update the physical item's WAC to exactly 500 for testing predictability
    UPDATE "Item" SET weighted_average_cost = 500, current_unit_cost = 500 WHERE id = v_item_physical;

    -- Artificially inject stock into the godown to prevent ERR_INSUFFICIENT_STOCK during the test
    INSERT INTO "CurrentStock" (company_id, godown_id, item_id, current_qty) 
    VALUES (v_company_id, v_godown_id, v_item_physical, 100)
    ON CONFLICT (company_id, godown_id, item_id) DO UPDATE SET current_qty = "CurrentStock".current_qty + 100;

    -- ==========================================
    -- TEST 1: Physical Sale
    -- ==========================================
    v_payload_physical := jsonb_build_object(
        'company_id', v_company_id,
        'godown_id', v_godown_id,
        'customer_id', v_customer_id,
        'customer_name', v_customer_name,
        'invoice_date', v_valid_date,
        'due_date', v_valid_date,
        'invoice_number', 'TEST-PHYS-001',
        'goods_subtotal', 1000,
        'sundry_charges_total', 0,
        'total_tax_amount', 0,
        'grand_total', 1000,
        'line_items', jsonb_build_array(
            jsonb_build_object(
                'item_id', v_item_physical,
                'quantity', 1,
                'unit_price', 1000,
                'line_total', 1000
            )
        )
    );

    -- Simulate frontend passing AR (debit) and Sales Revenue (credit) legs
    v_gl_lines_physical := jsonb_build_array(
        jsonb_build_object('account_id', v_ar_acc, 'account_category', 'Accounts Receivable', 'debit_amount', 1000, 'credit_amount', 0),
        jsonb_build_object('account_id', v_sales_acc, 'account_category', 'Sales Revenue', 'debit_amount', 0, 'credit_amount', 1000)
    );

    -- Execute RPC
    v_invoice_res := rpc_checkout_sales_invoice(v_payload_physical, NULL, v_gl_lines_physical);
    v_journal_id := (v_invoice_res->>'journal_id')::UUID;

    -- Store results in a temp table so we can run pgTAP assertions outside the DO block
    CREATE TEMP TABLE tmp_test_results (
        test_name TEXT,
        journal_id UUID,
        line_count INT,
        cogs_amount NUMERIC
    );

    SELECT COUNT(*) INTO v_line_count FROM "GeneralLedgerLine" WHERE journal_id = v_journal_id;
    SELECT COALESCE((SELECT debit_amount FROM "GeneralLedgerLine" WHERE journal_id = v_journal_id AND account_id = resolve_item_gl_account_rpc(v_company_id, v_item_physical, 'cogs') LIMIT 1), 0) INTO v_cogs_amount;

    INSERT INTO tmp_test_results VALUES ('Physical', v_journal_id, v_line_count, v_cogs_amount);

    -- ==========================================
    -- TEST 2: Service Sale
    -- ==========================================
    v_payload_service := jsonb_build_object(
        'company_id', v_company_id,
        'godown_id', v_godown_id,
        'customer_id', v_customer_id,
        'customer_name', v_customer_name,
        'invoice_date', v_valid_date,
        'due_date', v_valid_date,
        'invoice_number', 'TEST-SERV-002',
        'goods_subtotal', 2000,
        'sundry_charges_total', 0,
        'total_tax_amount', 0,
        'grand_total', 2000,
        'line_items', jsonb_build_array(
            jsonb_build_object(
                'item_id', v_item_service,
                'quantity', 1,
                'unit_price', 2000,
                'line_total', 2000
            )
        )
    );

    -- Simulate frontend passing AR (debit) and Sales Revenue (credit) legs
    v_gl_lines_service := jsonb_build_array(
        jsonb_build_object('account_id', v_ar_acc, 'account_category', 'Accounts Receivable', 'debit_amount', 2000, 'credit_amount', 0),
        jsonb_build_object('account_id', v_sales_acc, 'account_category', 'Sales Revenue', 'debit_amount', 0, 'credit_amount', 2000)
    );

    -- Execute RPC
    v_invoice_res := rpc_checkout_sales_invoice(v_payload_service, NULL, v_gl_lines_service);
    v_journal_id := (v_invoice_res->>'journal_id')::UUID;

    SELECT COUNT(*) INTO v_line_count FROM "GeneralLedgerLine" WHERE journal_id = v_journal_id;
    SELECT COALESCE((SELECT debit_amount FROM "GeneralLedgerLine" WHERE journal_id = v_journal_id AND account_id = resolve_item_gl_account_rpc(v_company_id, v_item_service, 'cogs') LIMIT 1), 0) INTO v_cogs_amount;

    INSERT INTO tmp_test_results VALUES ('Service', v_journal_id, v_line_count, v_cogs_amount);

END $$;

-- ==========================================
-- RUN ASSERTIONS
-- ==========================================

-- Assertions for Physical Sale
SELECT is(
    (SELECT line_count FROM tmp_test_results WHERE test_name = 'Physical'),
    4,
    'Physical Sale must generate exactly 4 GL lines (AR, Sales, COGS, Inventory)'
);

SELECT is(
    (SELECT cogs_amount FROM tmp_test_results WHERE test_name = 'Physical'),
    500.00::NUMERIC,
    'Physical Sale COGS Debit must perfectly match the Item WAC (Rs. 500)'
);

SELECT is_empty(
    $$ SELECT 1 FROM "GeneralLedgerJournal" j JOIN tmp_test_results t ON t.journal_id = j.id WHERE t.test_name = 'Physical' AND is_balanced = false $$,
    'Physical Sale Journal must be strictly balanced'
);


-- Assertions for Service Sale
SELECT is(
    (SELECT line_count FROM tmp_test_results WHERE test_name = 'Service'),
    2,
    'Service Sale must generate exactly 2 GL lines (AR, Sales) and bypass COGS'
);

SELECT is(
    (SELECT cogs_amount FROM tmp_test_results WHERE test_name = 'Service'),
    0::NUMERIC,
    'Service Sale must NOT contain any COGS amounts'
);

SELECT is_empty(
    $$ SELECT 1 FROM "GeneralLedgerJournal" j JOIN tmp_test_results t ON t.journal_id = j.id WHERE t.test_name = 'Service' AND is_balanced = false $$,
    'Service Sale Journal must be strictly balanced'
);

-- Finish pgTAP
SELECT * FROM finish();

-- Rollback the transaction so we do not pollute the database with our test invoices!
ROLLBACK;
