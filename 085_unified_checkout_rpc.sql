-- 085_unified_checkout_rpc.sql
-- Phase: Unified Atomic Checkout, Idempotency, and Ledgers Security

-- 1. Create TransactionLocks for Idempotency
CREATE TABLE IF NOT EXISTS public."TransactionLocks" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key UUID UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public."TransactionLocks" ENABLE ROW LEVEL SECURITY;

-- 2. Lock down Ledger Tables to Read-Only for standard users
DROP POLICY IF EXISTS "insert_InventoryLedger" ON public."InventoryLedger";
DROP POLICY IF EXISTS "update_InventoryLedger" ON public."InventoryLedger";
DROP POLICY IF EXISTS "delete_InventoryLedger" ON public."InventoryLedger";

DROP POLICY IF EXISTS "insert_CurrentStock" ON public."CurrentStock";
DROP POLICY IF EXISTS "update_CurrentStock" ON public."CurrentStock";
DROP POLICY IF EXISTS "delete_CurrentStock" ON public."CurrentStock";

DROP POLICY IF EXISTS "insert_GeneralLedgerLine" ON public."GeneralLedgerLine";
DROP POLICY IF EXISTS "update_GeneralLedgerLine" ON public."GeneralLedgerLine";
DROP POLICY IF EXISTS "delete_GeneralLedgerLine" ON public."GeneralLedgerLine";

-- 3. Internal Functions (Sales)

CREATE OR REPLACE FUNCTION rpc_internal_save_sales_invoice(p_payload JSONB)
RETURNS UUID AS $$
DECLARE
    v_invoice_id UUID;
    v_existing_status VARCHAR;
BEGIN
    v_invoice_id := NULLIF(TRIM(p_payload->>'id'), '')::UUID;
    
    IF v_invoice_id IS NOT NULL THEN
        SELECT status INTO v_existing_status FROM "SalesInvoice" WHERE id = v_invoice_id;
        IF FOUND AND v_existing_status = 'Posted' THEN
            RAISE EXCEPTION 'ERR_ALREADY_POSTED: Invoice is already posted and cannot be modified.';
        END IF;
    ELSE
        v_invoice_id := gen_random_uuid();
    END IF;

    INSERT INTO "SalesInvoice" (
        id, invoice_number, customer_id, customer_name, sales_order_id, invoice_date, due_date, status, payment_status,
        goods_subtotal, sundry_charges_total, total_tax_amount, grand_total, notes, line_items, company_id, godown_id
    ) VALUES (
        v_invoice_id, p_payload->>'invoice_number', NULLIF(TRIM(p_payload->>'customer_id'), '')::UUID, p_payload->>'customer_name', NULLIF(TRIM(p_payload->>'sales_order_id'), '')::UUID,
        (p_payload->>'invoice_date')::TIMESTAMP WITH TIME ZONE, (p_payload->>'due_date')::TIMESTAMP WITH TIME ZONE, 'Posted', COALESCE(p_payload->>'payment_status', 'Unpaid'),
        (p_payload->>'goods_subtotal')::NUMERIC, (p_payload->>'sundry_charges_total')::NUMERIC, (p_payload->>'total_tax_amount')::NUMERIC, (p_payload->>'grand_total')::NUMERIC,
        p_payload->>'notes', p_payload->'line_items', NULLIF(TRIM(p_payload->>'company_id'), '')::UUID, NULLIF(TRIM(p_payload->>'godown_id'), '')::UUID
    )
    ON CONFLICT (id) DO UPDATE SET
        invoice_number = EXCLUDED.invoice_number,
        customer_id = EXCLUDED.customer_id,
        customer_name = EXCLUDED.customer_name,
        sales_order_id = EXCLUDED.sales_order_id,
        invoice_date = EXCLUDED.invoice_date,
        due_date = EXCLUDED.due_date,
        status = EXCLUDED.status,
        payment_status = EXCLUDED.payment_status,
        goods_subtotal = EXCLUDED.goods_subtotal,
        sundry_charges_total = EXCLUDED.sundry_charges_total,
        total_tax_amount = EXCLUDED.total_tax_amount,
        grand_total = EXCLUDED.grand_total,
        notes = EXCLUDED.notes,
        line_items = EXCLUDED.line_items,
        company_id = EXCLUDED.company_id,
        godown_id = EXCLUDED.godown_id
    RETURNING id INTO v_invoice_id;

    IF v_invoice_id IS NULL THEN
        RAISE EXCEPTION 'ERR_SILENT_FAIL: Failed to insert or update Sales Invoice.';
    END IF;

    RETURN v_invoice_id;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION rpc_internal_deduct_stock(p_company_id UUID, p_invoice_id UUID)
RETURNS VOID AS $$
DECLARE
    v_invoice RECORD;
    v_item JSONB;
    v_item_id UUID;
    v_quantity NUMERIC;
    v_is_physical BOOLEAN;
    v_locked_stock NUMERIC;
BEGIN
    SELECT * INTO v_invoice FROM "SalesInvoice" WHERE id = p_invoice_id;
    
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_invoice.line_items)
    LOOP
        v_item_id := NULLIF(TRIM(v_item->>'item_id'), '')::UUID;
        v_quantity := COALESCE((v_item->>'quantity')::NUMERIC, 0);
        
        IF v_item_id IS NOT NULL AND v_quantity > 0 THEN
            SELECT is_physical INTO v_is_physical FROM "Item" WHERE id = v_item_id;
            
            IF v_is_physical THEN
                -- CONCURRENCY ROW LOCK
                SELECT current_qty INTO v_locked_stock 
                FROM "CurrentStock" 
                WHERE item_id = v_item_id AND godown_id = v_invoice.godown_id 
                FOR UPDATE;

                IF v_locked_stock IS NULL OR v_locked_stock < v_quantity THEN
                    RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK: Insufficient stock for item % in this godown.', v_item_id;
                END IF;

                UPDATE "Item" SET quantity_on_hand = quantity_on_hand - v_quantity WHERE id = v_item_id;

                INSERT INTO "InventoryLedger" (
                    company_id, item_id, transaction_type, godown_id, quantity_out, transaction_date, reference_id, reference_type
                ) VALUES (
                    p_company_id, v_item_id, 'SalesInvoice', v_invoice.godown_id, v_quantity, v_invoice.invoice_date, p_invoice_id, 'SalesInvoice'
                );
            END IF;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION rpc_checkout_sales_invoice(p_payload JSONB, p_idempotency_key UUID, p_gl_lines JSONB)
RETURNS JSONB AS $$
DECLARE
    v_invoice_id UUID;
    v_journal_id UUID;
    v_company_id UUID;
    v_invoice_date DATE;
    v_invoice_number VARCHAR;
    v_notes VARCHAR;
    v_is_from_challan BOOLEAN := COALESCE((p_payload->>'is_from_challan')::BOOLEAN, FALSE);
BEGIN
    IF p_idempotency_key IS NOT NULL THEN
        INSERT INTO public."TransactionLocks" (idempotency_key) VALUES (p_idempotency_key);
    END IF;

    v_company_id := (p_payload->>'company_id')::UUID;
    v_invoice_date := (p_payload->>'invoice_date')::DATE;
    v_invoice_number := p_payload->>'invoice_number';
    v_notes := COALESCE(p_payload->>'notes', 'Sales Invoice ' || v_invoice_number);

    v_invoice_id := rpc_internal_save_sales_invoice(p_payload);
    
    -- [CRITICAL GUARDRAIL]: Bypass inventory deduction if materials were already issued via Delivery Challan
    IF NOT v_is_from_challan THEN
        PERFORM rpc_internal_deduct_stock(v_company_id, v_invoice_id);
    END IF;

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


-- 4. Internal Functions (Purchases)

CREATE OR REPLACE FUNCTION rpc_internal_save_purchase_invoice(p_payload JSONB)
RETURNS UUID AS $$
DECLARE
    v_invoice_id UUID;
    v_existing_status VARCHAR;
BEGIN
    v_invoice_id := NULLIF(TRIM(p_payload->>'id'), '')::UUID;
    
    IF v_invoice_id IS NOT NULL THEN
        SELECT status INTO v_existing_status FROM "PurchaseInvoice" WHERE id = v_invoice_id;
        IF FOUND AND v_existing_status = 'Posted' THEN
            RAISE EXCEPTION 'ERR_ALREADY_POSTED: Invoice is already posted and cannot be modified.';
        END IF;
    ELSE
        v_invoice_id := gen_random_uuid();
    END IF;

    INSERT INTO "PurchaseInvoice" (
        id, invoice_number, vendor_id, vendor_name, po_reference_id, invoice_date, due_date, status, payment_status,
        subtotal, landed_cost_total, vat_amount, grand_total, notes, line_items, company_id, godown_id
    ) VALUES (
        v_invoice_id, p_payload->>'invoice_number', NULLIF(TRIM(p_payload->>'vendor_id'), '')::UUID, p_payload->>'vendor_name', NULLIF(TRIM(p_payload->>'po_reference_id'), '')::UUID,
        (p_payload->>'invoice_date')::TIMESTAMP WITH TIME ZONE, (p_payload->>'due_date')::TIMESTAMP WITH TIME ZONE, 'Posted', COALESCE(p_payload->>'payment_status', 'Unpaid'),
        (p_payload->>'subtotal')::NUMERIC, (p_payload->>'landed_cost_total')::NUMERIC, (p_payload->>'vat_amount')::NUMERIC, (p_payload->>'grand_total')::NUMERIC,
        p_payload->>'notes', p_payload->'line_items', NULLIF(TRIM(p_payload->>'company_id'), '')::UUID, NULLIF(TRIM(p_payload->>'godown_id'), '')::UUID
    )
    ON CONFLICT (id) DO UPDATE SET
        invoice_number = EXCLUDED.invoice_number,
        vendor_id = EXCLUDED.vendor_id,
        vendor_name = EXCLUDED.vendor_name,
        po_reference_id = EXCLUDED.po_reference_id,
        invoice_date = EXCLUDED.invoice_date,
        due_date = EXCLUDED.due_date,
        status = EXCLUDED.status,
        payment_status = EXCLUDED.payment_status,
        subtotal = EXCLUDED.subtotal,
        landed_cost_total = EXCLUDED.landed_cost_total,
        vat_amount = EXCLUDED.vat_amount,
        grand_total = EXCLUDED.grand_total,
        notes = EXCLUDED.notes,
        line_items = EXCLUDED.line_items,
        company_id = EXCLUDED.company_id,
        godown_id = EXCLUDED.godown_id
    RETURNING id INTO v_invoice_id;

    IF v_invoice_id IS NULL THEN
        RAISE EXCEPTION 'ERR_SILENT_FAIL: Failed to insert or update Purchase Invoice.';
    END IF;

    RETURN v_invoice_id;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION rpc_internal_add_stock(p_company_id UUID, p_invoice_id UUID)
RETURNS VOID AS $$
DECLARE
    v_invoice RECORD;
    v_item JSONB;
    v_item_id UUID;
    v_quantity NUMERIC;
    v_is_physical BOOLEAN;
BEGIN
    SELECT * INTO v_invoice FROM "PurchaseInvoice" WHERE id = p_invoice_id;
    
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_invoice.line_items)
    LOOP
        v_item_id := NULLIF(TRIM(v_item->>'item_id'), '')::UUID;
        v_quantity := COALESCE((v_item->>'quantity')::NUMERIC, 0);
        
        IF v_item_id IS NOT NULL AND v_quantity > 0 THEN
            SELECT is_physical INTO v_is_physical FROM "Item" WHERE id = v_item_id;
            
            IF v_is_physical THEN
                UPDATE "Item" SET quantity_on_hand = quantity_on_hand + v_quantity WHERE id = v_item_id;

                INSERT INTO "InventoryLedger" (
                    company_id, item_id, transaction_type, godown_id, quantity_in, transaction_date, reference_id, reference_type
                ) VALUES (
                    p_company_id, v_item_id, 'PurchaseInvoice', v_invoice.godown_id, v_quantity, v_invoice.invoice_date, p_invoice_id, 'PurchaseInvoice'
                );
            END IF;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION rpc_checkout_purchase_invoice(p_payload JSONB, p_idempotency_key UUID, p_gl_lines JSONB)
RETURNS JSONB AS $$
DECLARE
    v_invoice_id UUID;
    v_journal_id UUID;
    v_company_id UUID;
    v_invoice_date DATE;
    v_invoice_number VARCHAR;
    v_notes VARCHAR;
BEGIN
    IF p_idempotency_key IS NOT NULL THEN
        INSERT INTO public."TransactionLocks" (idempotency_key) VALUES (p_idempotency_key);
    END IF;

    v_company_id := (p_payload->>'company_id')::UUID;
    v_invoice_date := (p_payload->>'invoice_date')::DATE;
    v_invoice_number := p_payload->>'invoice_number';
    v_notes := COALESCE(p_payload->>'notes', 'Purchase Invoice ' || v_invoice_number);

    v_invoice_id := rpc_internal_save_purchase_invoice(p_payload);
    PERFORM rpc_internal_add_stock(v_company_id, v_invoice_id);
    v_journal_id := rpc_commit_journal_entry_internal(
        v_company_id, v_invoice_date, v_notes,
        'Purchases', v_invoice_id, 'PurchaseInvoice', v_invoice_number, p_gl_lines
    );

    RETURN jsonb_build_object('status', 'success', 'invoice_id', v_invoice_id, 'journal_id', v_journal_id);
EXCEPTION 
    WHEN unique_violation THEN
        RAISE EXCEPTION 'ERR_IDEMPOTENCY: This transaction has already been processed.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 5. Stock Transfer Atomic Coordinator

CREATE TABLE IF NOT EXISTS public."StockTransfer" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public."Company"(id),
    transfer_number VARCHAR(100) NOT NULL,
    source_godown_id UUID NOT NULL REFERENCES public."Godown"(id),
    dest_godown_id UUID NOT NULL REFERENCES public."Godown"(id),
    transfer_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'Transferred',
    notes TEXT,
    line_items JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE public."StockTransfer" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_StockTransfer" ON public."StockTransfer";
CREATE POLICY "select_StockTransfer" ON public."StockTransfer" FOR SELECT USING (auth.role() = 'authenticated');

CREATE OR REPLACE FUNCTION rpc_checkout_stock_transfer(p_payload JSONB, p_idempotency_key UUID)
RETURNS JSONB AS $$
DECLARE
    v_transfer_id UUID;
    v_company_id UUID;
    v_source_godown_id UUID;
    v_dest_godown_id UUID;
    v_transfer_date TIMESTAMP WITH TIME ZONE;
    v_items JSONB;
    v_item JSONB;
    v_item_id UUID;
    v_quantity NUMERIC;
    v_locked_stock NUMERIC;
    v_existing_status VARCHAR;
BEGIN
    IF p_idempotency_key IS NOT NULL THEN
        INSERT INTO public."TransactionLocks" (idempotency_key) VALUES (p_idempotency_key);
    END IF;

    v_transfer_id := NULLIF(TRIM(p_payload->>'id'), '')::UUID;
    v_company_id := (p_payload->>'company_id')::UUID;
    v_source_godown_id := (p_payload->>'source_godown_id')::UUID;
    v_dest_godown_id := (p_payload->>'dest_godown_id')::UUID;
    v_transfer_date := (p_payload->>'transfer_date')::TIMESTAMP WITH TIME ZONE;
    v_items := p_payload->'line_items';

    IF v_transfer_id IS NOT NULL THEN
        SELECT status INTO v_existing_status FROM "StockTransfer" WHERE id = v_transfer_id;
        IF v_existing_status = 'Transferred' THEN
            RAISE EXCEPTION 'ERR_ALREADY_POSTED: Stock Transfer is already posted.';
        END IF;

        UPDATE "StockTransfer" SET
            transfer_number = p_payload->>'transfer_number',
            source_godown_id = v_source_godown_id,
            dest_godown_id = v_dest_godown_id,
            transfer_date = v_transfer_date,
            status = 'Transferred',
            notes = p_payload->>'notes',
            line_items = v_items
        WHERE id = v_transfer_id;
    ELSE
        INSERT INTO public."StockTransfer" (
            id, company_id, transfer_number, source_godown_id, dest_godown_id, transfer_date, status, notes, line_items
        ) VALUES (
            COALESCE(v_transfer_id, gen_random_uuid()), NULLIF(TRIM(p_payload->>'company_id'), '')::UUID, p_payload->>'transfer_number', NULLIF(TRIM(p_payload->>'source_godown_id'), '')::UUID,
            NULLIF(TRIM(p_payload->>'dest_godown_id'), '')::UUID, (p_payload->>'transfer_date')::TIMESTAMP WITH TIME ZONE, 'Transferred', p_payload->>'notes', p_payload->'line_items'
        ) RETURNING id INTO v_transfer_id;
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
    LOOP
        v_item_id := NULLIF(TRIM(v_item->>'item_id'), '')::UUID;
        v_quantity := COALESCE((v_item->>'quantity')::NUMERIC, 0);
        
        IF v_item_id IS NOT NULL AND v_quantity > 0 THEN
            SELECT current_qty INTO v_locked_stock 
            FROM "CurrentStock" 
            WHERE item_id = v_item_id AND godown_id = v_source_godown_id 
            FOR UPDATE;

            IF v_locked_stock IS NULL OR v_locked_stock < v_quantity THEN
                RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK: Insufficient stock in Source Godown for item %.', v_item_id;
            END IF;

            INSERT INTO "InventoryLedger" (
                company_id, item_id, transaction_type, godown_id, quantity_out, transaction_date, reference_id, reference_type
            ) VALUES (
                v_company_id, v_item_id, 'StockTransfer', v_source_godown_id, v_quantity, v_transfer_date, v_transfer_id, 'StockTransfer'
            );

            INSERT INTO "InventoryLedger" (
                company_id, item_id, transaction_type, godown_id, quantity_in, transaction_date, reference_id, reference_type
            ) VALUES (
                v_company_id, v_item_id, 'StockTransfer', v_dest_godown_id, v_quantity, v_transfer_date, v_transfer_id, 'StockTransfer'
            );
        END IF;
    END LOOP;

    RETURN jsonb_build_object('status', 'success', 'transfer_id', v_transfer_id);
EXCEPTION 
    WHEN unique_violation THEN
        RAISE EXCEPTION 'ERR_IDEMPOTENCY: This transaction has already been processed.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;
