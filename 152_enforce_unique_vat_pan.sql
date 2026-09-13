-- ============================================================================
-- Migration: 152_enforce_unique_vat_pan.sql
-- Description: Enforce 9-digit Nepalese VAT/PAN format validation via trigger
--              and partial unique index per company on "BusinessPartner"
-- ============================================================================

-- Step 1: Clean and normalize existing tax_id_number data in BusinessPartner
-- Convert empty/whitespace or non-9-digit numeric values to NULL, and strip non-digits for valid 9-digit PANs
UPDATE "BusinessPartner"
SET tax_id_number = CASE 
    WHEN tax_id_number IS NULL THEN NULL
    WHEN LENGTH(REGEXP_REPLACE(TRIM(tax_id_number), '[^0-9]', '', 'g')) = 9 
        THEN REGEXP_REPLACE(TRIM(tax_id_number), '[^0-9]', '', 'g')
    ELSE NULL
END;

-- Step 2: Create Partial Unique Index per company for non-null, non-empty tax_id_number
CREATE UNIQUE INDEX IF NOT EXISTS idx_business_partner_company_vat_pan
ON "BusinessPartner" (company_id, tax_id_number)
WHERE tax_id_number IS NOT NULL AND tax_id_number <> '';

-- Step 3: Create PL/pgSQL Trigger Function for 9-digit format validation and sanitization
CREATE OR REPLACE FUNCTION trg_validate_and_sanitize_vat_pan_fn()
RETURNS TRIGGER AS $$
DECLARE
    v_raw TEXT;
    v_sanitized TEXT;
BEGIN
    -- If NULL, pass through
    IF NEW.tax_id_number IS NULL THEN
        RETURN NEW;
    END IF;

    v_raw := TRIM(NEW.tax_id_number);
    
    -- If empty string, normalize to NULL to satisfy partial unique index
    IF v_raw = '' THEN
        NEW.tax_id_number := NULL;
        RETURN NEW;
    END IF;

    -- Strip all non-digit characters
    v_sanitized := REGEXP_REPLACE(v_raw, '[^0-9]', '', 'g');

    -- Strictly validate length: must be exactly 9 numeric digits
    IF LENGTH(v_sanitized) <> 9 THEN
        RAISE EXCEPTION 'Invalid VAT/PAN number "%". Nepalese VAT/PAN must be exactly 9 numeric digits.', v_raw
            USING ERRCODE = '22023'; -- invalid_parameter_value
    END IF;

    NEW.tax_id_number := v_sanitized;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 4: Attach trigger to "BusinessPartner" before INSERT or UPDATE
DROP TRIGGER IF EXISTS trg_validate_and_sanitize_vat_pan ON "BusinessPartner";

CREATE TRIGGER trg_validate_and_sanitize_vat_pan
BEFORE INSERT OR UPDATE ON "BusinessPartner"
FOR EACH ROW
EXECUTE FUNCTION trg_validate_and_sanitize_vat_pan_fn();
