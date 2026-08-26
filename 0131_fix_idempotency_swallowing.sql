-- 1. Sales Checkout
CREATE OR REPLACE FUNCTION rpc_checkout_sales_invoice(p_payload JSONB, p_idempotency_key UUID, p_gl_lines JSONB)
RETURNS JSONB AS $BODY
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
    v_notes := COALESCE(p_payload->>'notes', 'Sales Invoice ' || v_invoice_number);

    v_invoice_id := rpc_internal_save_sales_invoice(p_payload);
    PERFORM rpc_internal_deduct_stock(v_company_id, v_invoice_id);
    v_journal_id := rpc_commit_journal_entry_internal(
        v_company_id, v_invoice_date, v_notes,
        'Sales', v_invoice_id, 'SalesInvoice', v_invoice_number, p_gl_lines
    );

    RETURN jsonb_build_object('status', 'success', 'invoice_id', v_invoice_id, 'journal_id', v_journal_id);
EXCEPTION 
    WHEN unique_violation THEN
        IF SQLERRM LIKE '%TransactionLocks%' THEN
            RAISE EXCEPTION 'ERR_IDEMPOTENCY: This transaction has already been processed.';
        ELSE
            RAISE EXCEPTION 'ERR_DUPLICATE_DOC: This document number is already in use. Please enter a new number.';
        END IF;
END;
$BODY LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 2. Purchase Checkout
CREATE OR REPLACE FUNCTION rpc_checkout_purchase_invoice(p_payload JSONB, p_idempotency_key UUID, p_gl_lines JSONB)
RETURNS JSONB AS $BODY
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
        IF SQLERRM LIKE '%TransactionLocks%' THEN
            RAISE EXCEPTION 'ERR_IDEMPOTENCY: This transaction has already been processed.';
        ELSE
            RAISE EXCEPTION 'ERR_DUPLICATE_DOC: This document number is already in use. Please enter a new number.';
        END IF;
END;
$BODY LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 3. Stock Transfer Checkout
CREATE OR REPLACE FUNCTION rpc_checkout_stock_transfer(p_payload JSONB, p_idempotency_key UUID)
RETURNS JSONB AS $BODY
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
        IF SQLERRM LIKE '%TransactionLocks%' THEN
            RAISE EXCEPTION 'ERR_IDEMPOTENCY: This transaction has already been processed.';
        ELSE
            RAISE EXCEPTION 'ERR_DUPLICATE_DOC: This document number is already in use. Please enter a new number.';
        END IF;
END;
$BODY LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;
