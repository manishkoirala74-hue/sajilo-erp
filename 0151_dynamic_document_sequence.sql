-- =========================================================================================
-- MIGRATION 0151: DYNAMIC DOCUMENT SEQUENCE CONFIGURATION & ENTERPRISE NUMBERING ENGINE
-- =========================================================================================

-- 1. CREATE DYNAMIC DOCUMENT SEQUENCE CONFIGURATION TABLE
CREATE TABLE IF NOT EXISTS "DocumentSequenceConfig" (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES "Company"(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL,
    document_label TEXT NOT NULL,
    prefix TEXT DEFAULT '',
    suffix TEXT DEFAULT '',
    padding INTEGER DEFAULT 5 CHECK (padding BETWEEN 2 AND 10),
    include_fy_prefix BOOLEAN DEFAULT true,
    starting_number INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(company_id, document_type)
);

-- Enable RLS & Policies
ALTER TABLE "DocumentSequenceConfig" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_DocumentSequenceConfig" ON "DocumentSequenceConfig";
DROP POLICY IF EXISTS "insert_DocumentSequenceConfig" ON "DocumentSequenceConfig";
DROP POLICY IF EXISTS "update_DocumentSequenceConfig" ON "DocumentSequenceConfig";
DROP POLICY IF EXISTS "delete_DocumentSequenceConfig" ON "DocumentSequenceConfig";

CREATE POLICY "select_DocumentSequenceConfig" ON "DocumentSequenceConfig" FOR SELECT USING (
    (EXISTS (SELECT 1 FROM public."User" WHERE id::text = auth.uid()::text AND role = 'admin')) OR 
    (company_id IN (SELECT company_id::uuid FROM public."UserCompany" WHERE user_id::text = auth.uid()::text))
);

CREATE POLICY "insert_DocumentSequenceConfig" ON "DocumentSequenceConfig" FOR INSERT WITH CHECK (
    (EXISTS (SELECT 1 FROM public."User" WHERE id::text = auth.uid()::text AND role = 'admin')) OR 
    (company_id IN (SELECT company_id::uuid FROM public."UserCompany" WHERE user_id::text = auth.uid()::text))
);

CREATE POLICY "update_DocumentSequenceConfig" ON "DocumentSequenceConfig" FOR UPDATE USING (
    (EXISTS (SELECT 1 FROM public."User" WHERE id::text = auth.uid()::text AND role = 'admin')) OR 
    (company_id IN (SELECT company_id::uuid FROM public."UserCompany" WHERE user_id::text = auth.uid()::text))
) WITH CHECK (
    (EXISTS (SELECT 1 FROM public."User" WHERE id::text = auth.uid()::text AND role = 'admin')) OR 
    (company_id IN (SELECT company_id::uuid FROM public."UserCompany" WHERE user_id::text = auth.uid()::text))
);

CREATE POLICY "delete_DocumentSequenceConfig" ON "DocumentSequenceConfig" FOR DELETE USING (
    (EXISTS (SELECT 1 FROM public."User" WHERE id::text = auth.uid()::text AND role = 'admin')) OR 
    (company_id IN (SELECT company_id::uuid FROM public."UserCompany" WHERE user_id::text = auth.uid()::text))
);

-- Ghost Mode Protection Trigger Attachment
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'prevent_ghost_mode_mutations') THEN
        DROP TRIGGER IF EXISTS enforce_ghost_mode ON "DocumentSequenceConfig";
        CREATE TRIGGER enforce_ghost_mode 
        BEFORE INSERT OR UPDATE OR DELETE ON "DocumentSequenceConfig" 
        FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
    END IF;
END $$;

-- 2. ENHANCED VOUCHER SEQUENCE GENERATOR FUNCTION
CREATE OR REPLACE FUNCTION get_next_voucher_number(
    p_company_id UUID,
    p_voucher_type TEXT,
    p_date DATE
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_fy RECORD;
    v_seq RECORD;
    v_config RECORD;
    v_result TEXT;
    v_prefix TEXT;
    v_suffix TEXT;
    v_fy_prefix TEXT := '';
    v_padding INTEGER := 5;
    v_effective_padding INTEGER;
    v_starting_no INTEGER := 1;
    v_number_str TEXT;
BEGIN
    IF p_date IS NULL THEN
        p_date := CURRENT_DATE;
    END IF;

    -- 1. Resolve Fiscal Year
    SELECT * INTO v_fy FROM "FiscalYear" 
    WHERE company_id = p_company_id AND p_date BETWEEN start_date AND end_date LIMIT 1;
    
    IF NOT FOUND THEN
        SELECT * INTO v_fy FROM "FiscalYear" 
        WHERE company_id = p_company_id ORDER BY start_date DESC LIMIT 1;
    END IF;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No Fiscal Year found for company % on date %', p_company_id, p_date;
    END IF;

    -- 2. Fetch Dynamic Config for Document Type
    SELECT * INTO v_config FROM "DocumentSequenceConfig"
    WHERE company_id = p_company_id AND document_type = p_voucher_type AND is_active = true LIMIT 1;

    IF FOUND THEN
        v_prefix := COALESCE(v_config.prefix, '');
        v_suffix := COALESCE(v_config.suffix, '');
        v_padding := COALESCE(v_config.padding, 5);
        v_starting_no := COALESCE(v_config.starting_number, 1);
        IF COALESCE(v_config.include_fy_prefix, true) THEN
            v_fy_prefix := v_fy.fiscal_year_name || '-';
        END IF;
    ELSE
        -- Default Fallbacks if config row is not yet seeded
        IF p_voucher_type = 'SalesInvoice' THEN v_prefix := 'SI';
        ELSIF p_voucher_type = 'PurchaseInvoice' THEN v_prefix := 'PI';
        ELSIF p_voucher_type = 'SalesOrder' THEN v_prefix := 'SO';
        ELSIF p_voucher_type = 'PurchaseOrder' THEN v_prefix := 'PO';
        ELSIF p_voucher_type = 'Quotation' THEN v_prefix := 'QT';
        ELSIF p_voucher_type = 'Receipt' THEN v_prefix := 'RV';
        ELSIF p_voucher_type = 'Payment' THEN v_prefix := 'PV';
        ELSIF p_voucher_type = 'Journal' THEN v_prefix := 'JV';
        ELSIF p_voucher_type = 'Contra' THEN v_prefix := 'CV';
        ELSIF p_voucher_type = 'StockAdjustment' THEN v_prefix := 'ADJ';
        ELSE v_prefix := UPPER(SUBSTRING(p_voucher_type FROM 1 FOR 3));
        END IF;
        
        v_suffix := '';
        v_fy_prefix := v_fy.fiscal_year_name || '-';
        v_padding := 5;
        v_starting_no := 1;
    END IF;

    -- 3. Lock sequence row for concurrency control (FOR UPDATE)
    SELECT * INTO v_seq FROM "VoucherSequence" 
    WHERE company_id = p_company_id AND fiscal_year_id = v_fy.id AND voucher_type = p_voucher_type
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO "VoucherSequence" (company_id, fiscal_year_id, voucher_type, current_number)
        VALUES (p_company_id, v_fy.id, p_voucher_type, v_starting_no)
        RETURNING * INTO v_seq;
    ELSE
        UPDATE "VoucherSequence" SET current_number = current_number + 1 
        WHERE id = v_seq.id RETURNING * INTO v_seq;
    END IF;

    -- 4. Dynamic Padding Floor Safeguard (Prevent Truncation)
    v_effective_padding := GREATEST(v_padding, LENGTH(v_seq.current_number::TEXT));
    v_number_str := LPAD(v_seq.current_number::TEXT, v_effective_padding, '0');

    -- 5. Build Final Formatted Voucher String
    IF v_prefix != '' AND v_prefix NOT LIKE '%-' AND v_prefix NOT LIKE '%/' THEN
        v_prefix := v_prefix || '-';
    END IF;

    v_result := v_prefix || v_fy_prefix || v_number_str || v_suffix;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_next_voucher_number(UUID, TEXT, DATE) TO authenticated;

-- 3. TRIGGER STATE GUARDS (PREVENT SEQUENCE REGENERATION ON EDITS & DRAFT GAPLESS INTEGRITY)

-- Financial Voucher Trigger
CREATE OR REPLACE FUNCTION auto_generate_voucher_number_fin() RETURNS TRIGGER AS $$
BEGIN
    IF (NEW.status IS NULL OR NEW.status IN ('Posted', 'Saved', 'Approved')) THEN
        IF (TG_OP = 'INSERT' AND (NEW.voucher_number IS NULL OR NEW.voucher_number = 'AUTO' OR TRIM(NEW.voucher_number) = '')) OR 
           (TG_OP = 'UPDATE' AND (OLD.status = 'Draft' OR OLD.voucher_number IS NULL OR OLD.voucher_number = 'AUTO' OR TRIM(OLD.voucher_number) = '')) THEN
            NEW.voucher_number := get_next_voucher_number(NEW.company_id, COALESCE(NEW.voucher_type, 'Journal'), (NEW.voucher_date)::DATE);
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Sales Invoice Trigger
CREATE OR REPLACE FUNCTION auto_generate_voucher_number_sinv() RETURNS TRIGGER AS $$
BEGIN
    IF (NEW.status IS NULL OR NEW.status IN ('Posted', 'Saved', 'Issued', 'Paid', 'Partially Paid')) THEN
        IF (TG_OP = 'INSERT' AND (NEW.invoice_number IS NULL OR NEW.invoice_number = 'AUTO' OR TRIM(NEW.invoice_number) = '')) OR 
           (TG_OP = 'UPDATE' AND (OLD.status = 'Draft' OR OLD.invoice_number IS NULL OR OLD.invoice_number = 'AUTO' OR TRIM(OLD.invoice_number) = '')) THEN
            NEW.invoice_number := get_next_voucher_number(NEW.company_id, 'SalesInvoice', (NEW.invoice_date)::DATE);
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Purchase Invoice Trigger
CREATE OR REPLACE FUNCTION auto_generate_voucher_number_pinv() RETURNS TRIGGER AS $$
BEGIN
    IF (NEW.status IS NULL OR NEW.status IN ('Posted', 'Saved', 'Received', 'Paid', 'Partially Paid')) THEN
        IF (TG_OP = 'INSERT' AND (NEW.invoice_number IS NULL OR NEW.invoice_number = 'AUTO' OR TRIM(NEW.invoice_number) = '')) OR 
           (TG_OP = 'UPDATE' AND (OLD.status = 'Draft' OR OLD.invoice_number IS NULL OR OLD.invoice_number = 'AUTO' OR TRIM(OLD.invoice_number) = '')) THEN
            NEW.invoice_number := get_next_voucher_number(NEW.company_id, 'PurchaseInvoice', (NEW.invoice_date)::DATE);
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- POS Sale Trigger
CREATE OR REPLACE FUNCTION auto_generate_voucher_number_pos() RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT' AND (NEW.sale_number IS NULL OR NEW.sale_number = 'AUTO' OR TRIM(NEW.sale_number) = '')) OR 
       (TG_OP = 'UPDATE' AND (OLD.sale_number IS NULL OR OLD.sale_number = 'AUTO' OR TRIM(OLD.sale_number) = '')) THEN
        NEW.sale_number := get_next_voucher_number(NEW.company_id, 'POS', (NEW.sale_date)::DATE);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Quotation Trigger
CREATE OR REPLACE FUNCTION auto_generate_voucher_number_qt() RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT' AND (NEW.quotation_number IS NULL OR NEW.quotation_number = 'AUTO' OR TRIM(NEW.quotation_number) = '')) OR 
       (TG_OP = 'UPDATE' AND (OLD.quotation_number IS NULL OR OLD.quotation_number = 'AUTO' OR TRIM(OLD.quotation_number) = '')) THEN
        NEW.quotation_number := get_next_voucher_number(NEW.company_id, 'Quotation', (NEW.quotation_date)::DATE);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Sales Order Trigger
CREATE OR REPLACE FUNCTION auto_generate_voucher_number_so() RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT' AND (NEW.order_number IS NULL OR NEW.order_number = 'AUTO' OR TRIM(NEW.order_number) = '')) OR 
       (TG_OP = 'UPDATE' AND (OLD.order_number IS NULL OR OLD.order_number = 'AUTO' OR TRIM(OLD.order_number) = '')) THEN
        NEW.order_number := get_next_voucher_number(NEW.company_id, 'SalesOrder', COALESCE((NEW.order_date)::DATE, CURRENT_DATE));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Purchase Order Trigger
CREATE OR REPLACE FUNCTION auto_generate_voucher_number_po() RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT' AND (NEW.order_number IS NULL OR NEW.order_number = 'AUTO' OR TRIM(NEW.order_number) = '')) OR 
       (TG_OP = 'UPDATE' AND (OLD.order_number IS NULL OR OLD.order_number = 'AUTO' OR TRIM(OLD.order_number) = '')) THEN
        NEW.order_number := get_next_voucher_number(NEW.company_id, 'PurchaseOrder', COALESCE((NEW.order_date)::DATE, CURRENT_DATE));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Stock Adjustment Trigger
CREATE OR REPLACE FUNCTION auto_generate_voucher_number_adj() RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT' AND (NEW.adjustment_number IS NULL OR NEW.adjustment_number = 'AUTO' OR TRIM(NEW.adjustment_number) = '')) OR 
       (TG_OP = 'UPDATE' AND (OLD.adjustment_number IS NULL OR OLD.adjustment_number = 'AUTO' OR TRIM(OLD.adjustment_number) = '')) THEN
        NEW.adjustment_number := get_next_voucher_number(NEW.company_id, 'StockAdjustment', COALESCE((NEW.adjustment_date)::DATE, CURRENT_DATE));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach Triggers (BEFORE INSERT OR UPDATE)
DROP TRIGGER IF EXISTS trg_auto_num_fin ON "FinancialVoucher";
CREATE TRIGGER trg_auto_num_fin 
BEFORE INSERT OR UPDATE ON "FinancialVoucher" 
FOR EACH ROW EXECUTE FUNCTION auto_generate_voucher_number_fin();

DROP TRIGGER IF EXISTS trg_auto_num_sinv ON "SalesInvoice";
CREATE TRIGGER trg_auto_num_sinv 
BEFORE INSERT OR UPDATE ON "SalesInvoice" 
FOR EACH ROW EXECUTE FUNCTION auto_generate_voucher_number_sinv();

DROP TRIGGER IF EXISTS trg_auto_num_pinv ON "PurchaseInvoice";
CREATE TRIGGER trg_auto_num_pinv 
BEFORE INSERT OR UPDATE ON "PurchaseInvoice" 
FOR EACH ROW EXECUTE FUNCTION auto_generate_voucher_number_pinv();

DROP TRIGGER IF EXISTS trg_auto_num_pos ON "POSSale";
CREATE TRIGGER trg_auto_num_pos 
BEFORE INSERT OR UPDATE ON "POSSale" 
FOR EACH ROW EXECUTE FUNCTION auto_generate_voucher_number_pos();

DROP TRIGGER IF EXISTS trg_auto_num_qt ON "Quotation";
CREATE TRIGGER trg_auto_num_qt 
BEFORE INSERT OR UPDATE ON "Quotation" 
FOR EACH ROW EXECUTE FUNCTION auto_generate_voucher_number_qt();

DROP TRIGGER IF EXISTS trg_auto_num_so ON "SalesOrder";
CREATE TRIGGER trg_auto_num_so 
BEFORE INSERT OR UPDATE ON "SalesOrder" 
FOR EACH ROW EXECUTE FUNCTION auto_generate_voucher_number_so();

DROP TRIGGER IF EXISTS trg_auto_num_po ON "PurchaseOrder";
CREATE TRIGGER trg_auto_num_po 
BEFORE INSERT OR UPDATE ON "PurchaseOrder" 
FOR EACH ROW EXECUTE FUNCTION auto_generate_voucher_number_po();

DROP TRIGGER IF EXISTS trg_auto_num_adj ON "StockAdjustment";
CREATE TRIGGER trg_auto_num_adj 
BEFORE INSERT OR UPDATE ON "StockAdjustment" 
FOR EACH ROW EXECUTE FUNCTION auto_generate_voucher_number_adj();

-- 4. HISTORICAL SEQUENCE SEEDING & DYNAMIC BACKFILL
DO $$
DECLARE
    rec RECORD;
    v_fy RECORD;
    v_max_val INTEGER;
BEGIN
    FOR rec IN SELECT id AS company_id FROM "Company" LOOP
        FOR v_fy IN SELECT id, fiscal_year_name, start_date, end_date FROM "FiscalYear" WHERE company_id = rec.company_id LOOP
            -- Backfill Sales Invoice Max
            SELECT COALESCE(MAX(
                CASE 
                    WHEN invoice_number ~ '[0-9]+$' THEN (regexp_match(invoice_number, '([0-9]+)$'))[1]::INTEGER 
                    ELSE 0 
                END
            ), 0) INTO v_max_val
            FROM "SalesInvoice" 
            WHERE company_id = rec.company_id AND invoice_date BETWEEN v_fy.start_date AND v_fy.end_date;

            IF v_max_val > 0 THEN
                INSERT INTO "VoucherSequence" (company_id, fiscal_year_id, voucher_type, current_number)
                VALUES (rec.company_id, v_fy.id, 'SalesInvoice', v_max_val)
                ON CONFLICT (company_id, fiscal_year_id, voucher_type) 
                DO UPDATE SET current_number = GREATEST("VoucherSequence".current_number, EXCLUDED.current_number);
            END IF;

            -- Backfill Purchase Invoice Max
            SELECT COALESCE(MAX(
                CASE 
                    WHEN invoice_number ~ '[0-9]+$' THEN (regexp_match(invoice_number, '([0-9]+)$'))[1]::INTEGER 
                    ELSE 0 
                END
            ), 0) INTO v_max_val
            FROM "PurchaseInvoice" 
            WHERE company_id = rec.company_id AND invoice_date BETWEEN v_fy.start_date AND v_fy.end_date;

            IF v_max_val > 0 THEN
                INSERT INTO "VoucherSequence" (company_id, fiscal_year_id, voucher_type, current_number)
                VALUES (rec.company_id, v_fy.id, 'PurchaseInvoice', v_max_val)
                ON CONFLICT (company_id, fiscal_year_id, voucher_type) 
                DO UPDATE SET current_number = GREATEST("VoucherSequence".current_number, EXCLUDED.current_number);
            END IF;

            -- Backfill Financial Vouchers Max
            SELECT COALESCE(MAX(
                CASE 
                    WHEN voucher_number ~ '[0-9]+$' THEN (regexp_match(voucher_number, '([0-9]+)$'))[1]::INTEGER 
                    ELSE 0 
                END
            ), 0) INTO v_max_val
            FROM "FinancialVoucher" 
            WHERE company_id = rec.company_id AND voucher_date BETWEEN v_fy.start_date AND v_fy.end_date;

            IF v_max_val > 0 THEN
                INSERT INTO "VoucherSequence" (company_id, fiscal_year_id, voucher_type, current_number)
                VALUES (rec.company_id, v_fy.id, 'Journal', v_max_val)
                ON CONFLICT (company_id, fiscal_year_id, voucher_type) 
                DO UPDATE SET current_number = GREATEST("VoucherSequence".current_number, EXCLUDED.current_number);
            END IF;

            -- Backfill Quotation Max
            SELECT COALESCE(MAX(
                CASE 
                    WHEN quotation_number ~ '[0-9]+$' THEN (regexp_match(quotation_number, '([0-9]+)$'))[1]::INTEGER 
                    ELSE 0 
                END
            ), 0) INTO v_max_val
            FROM "Quotation" 
            WHERE company_id = rec.company_id AND quotation_date BETWEEN v_fy.start_date AND v_fy.end_date;

            IF v_max_val > 0 THEN
                INSERT INTO "VoucherSequence" (company_id, fiscal_year_id, voucher_type, current_number)
                VALUES (rec.company_id, v_fy.id, 'Quotation', v_max_val)
                ON CONFLICT (company_id, fiscal_year_id, voucher_type) 
                DO UPDATE SET current_number = GREATEST("VoucherSequence".current_number, EXCLUDED.current_number);
            END IF;

        END LOOP;
    END LOOP;
END $$;
