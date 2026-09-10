-- =========================================================================================
-- ROLLBACK MIGRATION 0151: DYNAMIC DOCUMENT SEQUENCE CONFIGURATION
-- =========================================================================================

-- 1. Restore previous trigger implementations
CREATE OR REPLACE FUNCTION auto_generate_voucher_number_fin() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.voucher_number IS NULL OR NEW.voucher_number = 'AUTO' THEN
    NEW.voucher_number := get_next_voucher_number(NEW.company_id, NEW.voucher_type, NEW.voucher_date::DATE);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION auto_generate_voucher_number_sinv() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = 'AUTO' THEN
    NEW.invoice_number := get_next_voucher_number(NEW.company_id, 'SalesInvoice', NEW.invoice_date::DATE);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION auto_generate_voucher_number_pinv() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = 'AUTO' THEN
    NEW.invoice_number := get_next_voucher_number(NEW.company_id, 'PurchaseInvoice', NEW.invoice_date::DATE);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION auto_generate_voucher_number_pos() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sale_number IS NULL OR NEW.sale_number = 'AUTO' THEN
    NEW.sale_number := get_next_voucher_number(NEW.company_id, 'POS', NEW.sale_date::DATE);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-attach BEFORE INSERT triggers
DROP TRIGGER IF EXISTS trg_auto_num_fin ON "FinancialVoucher";
CREATE TRIGGER trg_auto_num_fin BEFORE INSERT ON "FinancialVoucher" FOR EACH ROW EXECUTE FUNCTION auto_generate_voucher_number_fin();

DROP TRIGGER IF EXISTS trg_auto_num_sinv ON "SalesInvoice";
CREATE TRIGGER trg_auto_num_sinv BEFORE INSERT ON "SalesInvoice" FOR EACH ROW EXECUTE FUNCTION auto_generate_voucher_number_sinv();

DROP TRIGGER IF EXISTS trg_auto_num_pinv ON "PurchaseInvoice";
CREATE TRIGGER trg_auto_num_pinv BEFORE INSERT ON "PurchaseInvoice" FOR EACH ROW EXECUTE FUNCTION auto_generate_voucher_number_pinv();

DROP TRIGGER IF EXISTS trg_auto_num_pos ON "POSSale";
CREATE TRIGGER trg_auto_num_pos BEFORE INSERT ON "POSSale" FOR EACH ROW EXECUTE FUNCTION auto_generate_voucher_number_pos();

-- 2. Drop DocumentSequenceConfig table
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "DocumentSequenceConfig";
DROP TABLE IF EXISTS "DocumentSequenceConfig" CASCADE;
