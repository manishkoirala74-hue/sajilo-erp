-- ============================================================================
-- ROLLBACK: 127_harden_sales_cogs_mapping_rollback.sql
-- Restores the previous (silent-skip) behaviour of rpc_checkout_sales_invoice
-- and rpc_post_sales_invoice as defined in 103_fix_zero_cost_cogs.sql and
-- 20260725140500_cleanup_overloaded_rpcs.sql respectively.
--
-- WARNING: Rolling back will restore the silent-skip behaviour. Sales Invoices
-- for physical items whose COGS/Inventory accounts are not mapped will silently
-- omit the COGS/Inventory GL lines and the ERR_INCOMPLETE_JOURNAL error from
-- rpc_validate_journal_template() will fire again.
-- ============================================================================

BEGIN;

-- ─── 1. Restore rpc_checkout_sales_invoice (silent-skip version from 103) ────
CREATE OR REPLACE FUNCTION rpc_checkout_sales_invoice(
    p_payload         JSONB,
    p_idempotency_key UUID,
    p_gl_lines        JSONB
)
RETURNS JSONB AS $$
DECLARE
    v_invoice_id    UUID;
    v_journal_id    UUID;
    v_company_id    UUID;
    v_invoice_date  DATE;
    v_invoice_number VARCHAR;
    v_notes         VARCHAR;
    v_item          JSONB;
    v_item_id       UUID;
    v_quantity      NUMERIC;
    v_cost_at_sale  NUMERIC;
    v_cogs_acc      UUID;
    v_inv_acc       UUID;
    v_is_physical   BOOLEAN;
BEGIN
    IF p_idempotency_key IS NOT NULL THEN
        INSERT INTO public."TransactionLocks" (idempotency_key) VALUES (p_idempotency_key);
    END IF;

    v_company_id     := (p_payload->>'company_id')::UUID;
    v_invoice_date   := (p_payload->>'invoice_date')::DATE;
    v_invoice_number := p_payload->>'invoice_number';
    v_notes          := COALESCE(p_payload->>'notes', 'Sales Invoice ' || v_invoice_number);

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'line_items')
    LOOP
        v_item_id  := NULLIF(TRIM(v_item->>'item_id'), '')::UUID;
        v_quantity := COALESCE((v_item->>'quantity')::NUMERIC, 0);

        IF v_item_id IS NOT NULL AND v_quantity > 0 THEN
            SELECT is_physical, COALESCE(current_unit_cost, weighted_average_cost, 0)
            INTO v_is_physical, v_cost_at_sale
            FROM "Item"
            WHERE id = v_item_id;

            IF v_is_physical THEN
                v_cogs_acc := resolve_item_gl_account_rpc(v_company_id, v_item_id, 'cogs');
                v_inv_acc  := resolve_item_gl_account_rpc(v_company_id, v_item_id, 'inventory');

                IF v_cogs_acc IS NOT NULL AND v_inv_acc IS NOT NULL THEN
                    p_gl_lines := p_gl_lines || jsonb_build_object(
                        'account_id', v_cogs_acc, 'account_category', 'cogs',
                        'debit_amount', v_quantity * COALESCE(v_cost_at_sale, 0), 'credit_amount', 0,
                        'description', 'COGS for ' || v_invoice_number
                    );
                    p_gl_lines := p_gl_lines || jsonb_build_object(
                        'account_id', v_inv_acc, 'account_category', 'inventory',
                        'debit_amount', 0, 'credit_amount', v_quantity * COALESCE(v_cost_at_sale, 0),
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


-- ─── 2. Restore rpc_post_sales_invoice (silent-skip version from cleanup RPC) ─
CREATE OR REPLACE FUNCTION rpc_post_sales_invoice(
    p_company_id      UUID,
    p_invoice_id      UUID,
    p_idempotency_key UUID,
    p_gl_lines        JSONB,
    p_options         JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_journal_id     UUID;
    v_invoice        RECORD;
    v_item           JSONB;
    v_item_id        UUID;
    v_quantity       NUMERIC;
    v_cost_at_sale   NUMERIC;
    v_cogs_acc       UUID;
    v_inv_acc        UUID;
    v_final_gl_lines JSONB := '[]'::JSONB;
    v_user_gl_line   JSONB;
    v_is_physical    BOOLEAN;
    v_existing       RECORD;
    v_is_reversal    BOOLEAN;
BEGIN
    v_is_reversal := COALESCE((p_options->>'is_reversal')::BOOLEAN, false);

    SELECT * INTO v_existing FROM "SalesInvoice" WHERE idempotency_key::text = p_idempotency_key::text LIMIT 1;
    IF FOUND THEN
        SELECT * INTO v_invoice FROM "SalesInvoice" WHERE id = p_invoice_id;
        RETURN jsonb_build_object('status', 'duplicate', 'journal_id', v_invoice.gl_journal_id);
    END IF;

    SELECT * INTO v_invoice FROM "SalesInvoice" WHERE id = p_invoice_id;
    IF v_invoice.id IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;

    IF v_is_reversal THEN
        PERFORM rpc_delete_gl_journals(p_invoice_id, 'SalesInvoice');
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_invoice.line_items)
        LOOP
            v_item_id  := NULLIF(TRIM(v_item->>'item_id'), '')::UUID;
            v_quantity := COALESCE((v_item->>'quantity')::NUMERIC, 0);
            IF v_item_id IS NOT NULL AND v_quantity > 0 THEN
                SELECT is_physical INTO v_is_physical FROM "Item" WHERE id = v_item_id FOR UPDATE;
                IF v_is_physical THEN
                    UPDATE "Item" SET quantity_on_hand = quantity_on_hand + v_quantity WHERE id = v_item_id;
                END IF;
            END IF;
        END LOOP;
        DELETE FROM "InventoryHistory" WHERE reference_id = p_invoice_id AND reference_type = 'SalesInvoice';
        RETURN jsonb_build_object('status', 'success', 'journal_id', NULL);
    END IF;

    FOR v_user_gl_line IN SELECT * FROM jsonb_array_elements(p_gl_lines) LOOP
        v_final_gl_lines := v_final_gl_lines || v_user_gl_line;
    END LOOP;

    FOR v_item IN SELECT * FROM jsonb_array_elements(v_invoice.line_items)
    LOOP
        v_item_id  := NULLIF(TRIM(v_item->>'item_id'), '')::UUID;
        v_quantity := COALESCE((v_item->>'quantity')::NUMERIC, 0);

        IF v_item_id IS NOT NULL AND v_quantity > 0 THEN
            SELECT is_physical, COALESCE(current_unit_cost, weighted_average_cost, 0)
            INTO v_is_physical, v_cost_at_sale
            FROM "Item" WHERE id = v_item_id FOR UPDATE;

            IF v_is_physical THEN
                IF v_cost_at_sale > 0 THEN
                    v_cogs_acc := resolve_item_gl_account_rpc(p_company_id, v_item_id, 'cogs');
                    v_inv_acc  := resolve_item_gl_account_rpc(p_company_id, v_item_id, 'inventory');
                    IF v_cogs_acc IS NOT NULL AND v_inv_acc IS NOT NULL THEN
                        v_final_gl_lines := v_final_gl_lines || jsonb_build_object(
                            'account_id', v_cogs_acc, 'debit_amount', v_quantity * v_cost_at_sale, 'credit_amount', 0,
                            'description', 'COGS for ' || v_invoice.invoice_number
                        );
                        v_final_gl_lines := v_final_gl_lines || jsonb_build_object(
                            'account_id', v_inv_acc, 'debit_amount', 0, 'credit_amount', v_quantity * v_cost_at_sale,
                            'description', 'Inventory Out for ' || v_invoice.invoice_number
                        );
                    END IF;
                END IF;
                UPDATE "Item" SET quantity_on_hand = quantity_on_hand - v_quantity WHERE id = v_item_id;
                INSERT INTO "InventoryHistory" (
                    item_id, company_id, transaction_date, reference_id, reference_type, reference_no,
                    quantity_change, unit_cost, notes
                ) VALUES (
                    v_item_id, p_company_id, v_invoice.invoice_date, p_invoice_id, 'SalesInvoice', v_invoice.invoice_number,
                    -v_quantity, v_cost_at_sale, 'Sales Issue'
                );
            END IF;
        END IF;
    END LOOP;

    v_journal_id := rpc_commit_journal_entry_internal(
        p_company_id, v_invoice.invoice_date::DATE,
        COALESCE(v_invoice.notes, 'Sales Invoice ' || v_invoice.invoice_number),
        'Sales', p_invoice_id, 'SalesInvoice', v_invoice.invoice_number, v_final_gl_lines
    );

    UPDATE "SalesInvoice" SET status = 'Posted', idempotency_key = p_idempotency_key WHERE id = p_invoice_id;
    RETURN jsonb_build_object('status', 'success', 'journal_id', v_journal_id);
END;
$$ LANGUAGE plpgsql;

REVOKE EXECUTE ON FUNCTION rpc_post_sales_invoice(UUID, UUID, UUID, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rpc_post_sales_invoice(UUID, UUID, UUID, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_post_sales_invoice(UUID, UUID, UUID, JSONB, JSONB) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
