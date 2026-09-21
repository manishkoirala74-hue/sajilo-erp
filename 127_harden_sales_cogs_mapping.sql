-- ============================================================================
-- MIGRATION: 127_harden_sales_cogs_mapping.sql
-- PURPOSE:   Replace the silent COGS account-resolution skip in
--            rpc_checkout_sales_invoice (used by the Sales Invoice page) and
--            rpc_post_sales_invoice (used by the cleanup-RPC layer) with a hard
--            ERR_MISSING_ACCOUNT exception so the user gets a clear, actionable
--            error instead of the cryptic ERR_INCOMPLETE_JOURNAL downstream.
--
-- ROOT CAUSE: When resolve_item_gl_account_rpc() returns NULL (item has no
--             purchase_account_id, its category has none, and CompanySettings
--             has no gl_default_cogs_account_id), both functions silently skip
--             appending the COGS/Inventory GL lines.  The subsequent call to
--             rpc_validate_journal_template() then fires ERR_INCOMPLETE_JOURNAL
--             because it detects physical items but finds no COGS leg.
--
-- FIX:        For every physical item with quantity > 0, attempt account
--             resolution. If either the COGS or the Inventory account cannot
--             be resolved, raise ERR_MISSING_ACCOUNT immediately with a
--             human-readable message that tells the operator exactly what to fix.
--
-- ALSO FIXED: rpc_post_sales_invoice (cleanup-RPC variant) had the identical
--             silent-skip pattern in lines 218-227 of the cleanup migration
--             (20260725140500_cleanup_overloaded_rpcs.sql).
--
-- SCOPE:      Sales Invoice only.
--             POS Sale, Sales Return, Purchase Return and Stock Adjustment
--             already contain explicit NULL guards and raise ERR_MISSING_ACCOUNT
--             correctly — no changes needed.
--             Purchase Invoice does not do server-side COGS injection at all
--             (the frontend supplies all GL lines) — no change needed.
--             Financial Vouchers and Stock Transfers do not involve COGS — no
--             change needed.
--
-- ROLLBACK:   Run 127_harden_sales_cogs_mapping_rollback.sql
-- ============================================================================

BEGIN;

-- ─── 1. Harden rpc_checkout_sales_invoice ────────────────────────────────────
-- This is the RPC called by the Sales Invoice creation page via sajiloClient.
-- Migration 103_fix_zero_cost_cogs.sql last defined this function.
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
    v_item_name     TEXT;
    v_quantity      NUMERIC;
    v_cost_at_sale  NUMERIC;
    v_cogs_acc      UUID;
    v_inv_acc       UUID;
    v_is_physical   BOOLEAN;
    v_is_from_challan BOOLEAN;
BEGIN
    -- ── Idempotency lock ──────────────────────────────────────────────────────
    IF p_idempotency_key IS NOT NULL THEN
        INSERT INTO public."TransactionLocks" (idempotency_key) VALUES (p_idempotency_key);
    END IF;

    v_company_id     := (p_payload->>'company_id')::UUID;
    v_invoice_date   := (p_payload->>'invoice_date')::DATE;
    v_invoice_number := p_payload->>'invoice_number';
    v_notes          := COALESCE(p_payload->>'notes', 'Sales Invoice ' || v_invoice_number);
    v_is_from_challan := COALESCE((p_payload->>'is_from_challan')::BOOLEAN, FALSE);

    -- ── Inject COGS + Inventory GL lines for every physical item ──────────────
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'line_items')
    LOOP
        v_item_id   := NULLIF(TRIM(v_item->>'item_id'), '')::UUID;
        v_quantity  := COALESCE((v_item->>'quantity')::NUMERIC, 0);
        v_item_name := COALESCE(v_item->>'item_name', v_item_id::TEXT);

        IF v_item_id IS NOT NULL AND v_quantity > 0 THEN
            SELECT is_physical, COALESCE(current_unit_cost, weighted_average_cost, 0)
            INTO v_is_physical, v_cost_at_sale
            FROM "Item"
            WHERE id = v_item_id;

            IF v_is_physical THEN
                -- ── Resolve COGS account (hard fail if not found) ─────────────
                BEGIN
                    v_cogs_acc := resolve_item_gl_account_rpc(v_company_id, v_item_id, 'cogs');
                EXCEPTION WHEN OTHERS THEN
                    v_cogs_acc := NULL;
                END;

                IF v_cogs_acc IS NULL THEN
                    RAISE EXCEPTION
                        'ERR_MISSING_ACCOUNT: No COGS account is mapped for item "%". '
                        'Please set a Purchase / COGS account on the item, its category, '
                        'or configure a Default COGS account in Settings → GL Account Mappings.',
                        v_item_name;
                END IF;

                -- ── Resolve Inventory account (hard fail if not found) ────────
                BEGIN
                    v_inv_acc := resolve_item_gl_account_rpc(v_company_id, v_item_id, 'inventory');
                EXCEPTION WHEN OTHERS THEN
                    v_inv_acc := NULL;
                END;

                IF v_inv_acc IS NULL THEN
                    RAISE EXCEPTION
                        'ERR_MISSING_ACCOUNT: No Inventory account is mapped for item "%". '
                        'Please set an Inventory account on the item, its category, '
                        'or configure a Default Inventory account in Settings → GL Account Mappings.',
                        v_item_name;
                END IF;

                -- ── Append COGS debit + Inventory credit lines ────────────────
                p_gl_lines := p_gl_lines || jsonb_build_object(
                    'account_id',       v_cogs_acc,
                    'account_category', 'cogs',
                    'debit_amount',     v_quantity * COALESCE(v_cost_at_sale, 0),
                    'credit_amount',    0,
                    'description',      'COGS for ' || v_invoice_number
                );
                p_gl_lines := p_gl_lines || jsonb_build_object(
                    'account_id',       v_inv_acc,
                    'account_category', 'inventory',
                    'debit_amount',     0,
                    'credit_amount',    v_quantity * COALESCE(v_cost_at_sale, 0),
                    'description',      'Inventory Out for ' || v_invoice_number
                );
            END IF;
        END IF;
    END LOOP;

    -- ── Save invoice, deduct stock (unless from Delivery Challan), post GL ────
    v_invoice_id := rpc_internal_save_sales_invoice(p_payload);

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


-- ─── 2. Harden rpc_post_sales_invoice (cleanup-RPC variant) ──────────────────
-- Defined in 20260725140500_cleanup_overloaded_rpcs.sql lines 141-257.
-- This function also had the same silent-skip pattern at lines 218-227.
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
    v_journal_id    UUID;
    v_invoice       RECORD;
    v_item          JSONB;
    v_item_id       UUID;
    v_item_name     TEXT;
    v_quantity      NUMERIC;
    v_cost_at_sale  NUMERIC;
    v_cogs_acc      UUID;
    v_inv_acc       UUID;
    v_final_gl_lines JSONB := '[]'::JSONB;
    v_user_gl_line  JSONB;
    v_is_physical   BOOLEAN;
    v_existing      RECORD;
    v_is_reversal   BOOLEAN;
BEGIN
    v_is_reversal := COALESCE((p_options->>'is_reversal')::BOOLEAN, false);

    -- ── Idempotency: check existing ───────────────────────────────────────────
    SELECT * INTO v_existing FROM "SalesInvoice" WHERE idempotency_key::text = p_idempotency_key::text LIMIT 1;
    IF FOUND THEN
        SELECT * INTO v_invoice FROM "SalesInvoice" WHERE id = p_invoice_id;
        RETURN jsonb_build_object('status', 'duplicate', 'journal_id', v_invoice.gl_journal_id);
    END IF;

    SELECT * INTO v_invoice FROM "SalesInvoice" WHERE id = p_invoice_id;
    IF v_invoice.id IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;

    -- ── Reversal path ─────────────────────────────────────────────────────────
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

    -- ── Copy caller-supplied GL lines ─────────────────────────────────────────
    FOR v_user_gl_line IN SELECT * FROM jsonb_array_elements(p_gl_lines) LOOP
        v_final_gl_lines := v_final_gl_lines || v_user_gl_line;
    END LOOP;

    -- ── Inject COGS + Inventory GL lines for every physical item ──────────────
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_invoice.line_items)
    LOOP
        v_item_id   := NULLIF(TRIM(v_item->>'item_id'), '')::UUID;
        v_quantity  := COALESCE((v_item->>'quantity')::NUMERIC, 0);
        v_item_name := COALESCE(v_item->>'item_name', v_item_id::TEXT);

        IF v_item_id IS NOT NULL AND v_quantity > 0 THEN
            SELECT is_physical, COALESCE(current_unit_cost, weighted_average_cost, 0)
            INTO v_is_physical, v_cost_at_sale
            FROM "Item"
            WHERE id = v_item_id
            FOR UPDATE;

            IF v_is_physical THEN
                -- ── Resolve COGS account (hard fail) ──────────────────────────
                BEGIN
                    v_cogs_acc := resolve_item_gl_account_rpc(p_company_id, v_item_id, 'cogs');
                EXCEPTION WHEN OTHERS THEN
                    v_cogs_acc := NULL;
                END;

                IF v_cogs_acc IS NULL THEN
                    RAISE EXCEPTION
                        'ERR_MISSING_ACCOUNT: No COGS account is mapped for item "%". '
                        'Please set a Purchase / COGS account on the item, its category, '
                        'or configure a Default COGS account in Settings → GL Account Mappings.',
                        v_item_name;
                END IF;

                -- ── Resolve Inventory account (hard fail) ────────────────────
                BEGIN
                    v_inv_acc := resolve_item_gl_account_rpc(p_company_id, v_item_id, 'inventory');
                EXCEPTION WHEN OTHERS THEN
                    v_inv_acc := NULL;
                END;

                IF v_inv_acc IS NULL THEN
                    RAISE EXCEPTION
                        'ERR_MISSING_ACCOUNT: No Inventory account is mapped for item "%". '
                        'Please set an Inventory account on the item, its category, '
                        'or configure a Default Inventory account in Settings → GL Account Mappings.',
                        v_item_name;
                END IF;

                -- ── Append COGS + Inventory lines ─────────────────────────────
                IF v_cost_at_sale > 0 THEN
                    v_final_gl_lines := v_final_gl_lines || jsonb_build_object(
                        'account_id',   v_cogs_acc,
                        'debit_amount', v_quantity * v_cost_at_sale,
                        'credit_amount', 0,
                        'description',  'COGS for ' || v_invoice.invoice_number
                    );
                    v_final_gl_lines := v_final_gl_lines || jsonb_build_object(
                        'account_id',   v_inv_acc,
                        'debit_amount', 0,
                        'credit_amount', v_quantity * v_cost_at_sale,
                        'description',  'Inventory Out for ' || v_invoice.invoice_number
                    );
                END IF;

                -- ── Deduct stock ──────────────────────────────────────────────
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
        p_company_id,
        v_invoice.invoice_date::DATE,
        COALESCE(v_invoice.notes, 'Sales Invoice ' || v_invoice.invoice_number),
        'Sales',
        p_invoice_id,
        'SalesInvoice',
        v_invoice.invoice_number,
        v_final_gl_lines
    );

    UPDATE "SalesInvoice" SET status = 'Posted', idempotency_key = p_idempotency_key WHERE id = p_invoice_id;
    RETURN jsonb_build_object('status', 'success', 'journal_id', v_journal_id);
END;
$$ LANGUAGE plpgsql;

REVOKE EXECUTE ON FUNCTION rpc_post_sales_invoice(UUID, UUID, UUID, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rpc_post_sales_invoice(UUID, UUID, UUID, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_post_sales_invoice(UUID, UUID, UUID, JSONB, JSONB) TO service_role;


COMMIT;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
