BEGIN;

CREATE OR REPLACE FUNCTION rpc_commit_journal_entry_internal(
    p_company_id UUID,
    p_date DATE,
    p_narration TEXT,
    p_module TEXT,
    p_source_id UUID,
    p_source_type TEXT,
    p_reference TEXT,
    p_lines JSONB
) RETURNS UUID AS $$
DECLARE
    v_journal_id UUID;
    v_line JSONB;
    v_total_debit NUMERIC := 0;
    v_total_credit NUMERIC := 0;
BEGIN
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
        v_total_debit := v_total_debit + COALESCE((v_line->>'debit_amount')::NUMERIC, 0);
        v_total_credit := v_total_credit + COALESCE((v_line->>'credit_amount')::NUMERIC, 0);
    END LOOP;

    IF ABS(v_total_debit - v_total_credit) > 0.001 THEN
        RAISE EXCEPTION 'ERR_UNBALANCED_JOURNAL: Total Debit (%) does not equal Total Credit (%)', v_total_debit, v_total_credit;
    END IF;

    INSERT INTO "GeneralLedgerJournal" (
        company_id, entry_date, description, reference_module, source_document_id, source_document_type, voucher_no, total_debit, total_credit, is_balanced, status
    ) VALUES (
        p_company_id, p_date, p_narration, p_module, p_source_id, p_source_type, p_reference, v_total_debit, v_total_credit, true, 'Posted'
    ) RETURNING id INTO v_journal_id;

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
        IF COALESCE((v_line->>'debit_amount')::NUMERIC, 0) > 0 OR COALESCE((v_line->>'credit_amount')::NUMERIC, 0) > 0 THEN
            INSERT INTO "GeneralLedgerLine" (
                company_id, journal_id, account_id, account_category, description, debit_amount, credit_amount, entity_type, entity_id, due_date
            ) VALUES (
                p_company_id,
                v_journal_id,
                NULLIF(TRIM(v_line->>'account_id'), '')::UUID,
                v_line->>'account_category',
                v_line->>'description',
                COALESCE((v_line->>'debit_amount')::NUMERIC, 0),
                COALESCE((v_line->>'credit_amount')::NUMERIC, 0),
                v_line->>'entity_type',
                NULLIF(TRIM(v_line->>'entity_id'), '')::UUID,
                (v_line->>'due_date')::DATE
            );
        END IF;
    END LOOP;

    RETURN v_journal_id;
END;
$$ LANGUAGE plpgsql;

COMMIT;
