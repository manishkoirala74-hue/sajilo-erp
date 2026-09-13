-- ============================================================================
-- Migration Rollback: 152_enforce_unique_vat_pan_rollback.sql
-- Description: Revert trigger and unique index for BusinessPartner VAT/PAN validation
-- ============================================================================

DROP TRIGGER IF EXISTS trg_validate_and_sanitize_vat_pan ON "BusinessPartner";
DROP FUNCTION IF EXISTS trg_validate_and_sanitize_vat_pan_fn();
DROP INDEX IF EXISTS idx_business_partner_company_vat_pan;
