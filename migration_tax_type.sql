-- ==============================================================================
-- TAX TYPE TABLE — Full Schema with Multi-Tax / Compound Tax Support
-- Replaces the global gl_vat_payable_id setting with a proper tax ledger engine.
--
-- Key concepts:
--   sort_order   : Controls the sequence taxes are applied on a line item.
--                  Taxes with lower sort_order are applied FIRST.
--   is_compound  : If true, this tax's base = net_price + sum of all prior taxes.
--                  If false, base = net_price only.
--
-- Example — Excise Duty + Cascading VAT:
--   Excise: sort_order=1, is_compound=false → Excise = net × 20%
--   VAT:    sort_order=2, is_compound=true  → VAT = (net + Excise) × 13%
-- ==============================================================================

CREATE TABLE IF NOT EXISTS "TaxType" (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID         REFERENCES "Company"(id) ON DELETE CASCADE,
  tax_name          TEXT         NOT NULL,
  tax_code          TEXT,                          -- e.g. "VAT13", "EXC20", "TDS15"
  tax_rate          NUMERIC(6,3) NOT NULL DEFAULT 13,
  tax_type          TEXT         NOT NULL DEFAULT 'Exclusive'
                                 CHECK (tax_type IN ('Exclusive', 'Inclusive')),
  applies_to        TEXT         NOT NULL DEFAULT 'Both'
                                 CHECK (applies_to IN ('Sales', 'Purchase', 'Both')),
  sort_order        INT          NOT NULL DEFAULT 0,
  is_compound       BOOLEAN      NOT NULL DEFAULT false,
  gl_account_id     UUID         REFERENCES "ChartOfAccount"(id) ON DELETE SET NULL,
  gl_account_name   TEXT,
  is_default        BOOLEAN      NOT NULL DEFAULT false,
  is_active         BOOLEAN      NOT NULL DEFAULT true,
  description       TEXT,
  created_at        TIMESTAMPTZ  DEFAULT now(),
  updated_at        TIMESTAMPTZ  DEFAULT now()
);

-- Only one tax type can be the default per company
CREATE UNIQUE INDEX IF NOT EXISTS uniq_default_tax_per_company
  ON "TaxType" (company_id)
  WHERE is_default = true;

-- Enable RLS (same pattern as other tables)
ALTER TABLE "TaxType" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_isolation" ON "TaxType";
CREATE POLICY "company_isolation" ON "TaxType"
  USING (
    (EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin'))
    OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))
  );

-- ==============================================================================
-- ITEM MULTI-TAX SUPPORT
-- Items now carry a JSON array of tax_type_ids instead of the boolean is_vat_applicable.
-- Backward compat: if tax_type_ids is null/empty, system checks is_vat_applicable
-- and falls back to the default TaxType.
-- ==============================================================================

-- Add tax_type_ids column to Item if it doesn't exist
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS tax_type_ids JSONB DEFAULT '[]';

-- ==============================================================================
-- SEEDING: Standard Nepal VAT + Excise Duty example
-- Run manually in Supabase SQL editor, replacing <YOUR_COMPANY_ID>.
-- ==============================================================================
--
-- -- 1. Nepal VAT 13% (Exclusive, compound so it applies on top of Excise)
-- INSERT INTO "TaxType" (company_id, tax_name, tax_code, tax_rate, tax_type, applies_to,
--                        sort_order, is_compound, is_default, description)
-- VALUES ('<YOUR_COMPANY_ID>', 'VAT 13%', 'VAT13', 13, 'Exclusive', 'Both',
--         10, true, true, 'Nepal Value Added Tax at 13%. Compound: applied on (net + excise).')
-- ON CONFLICT DO NOTHING;
--
-- -- 2. Excise Duty 20% (non-compound, applied first)
-- INSERT INTO "TaxType" (company_id, tax_name, tax_code, tax_rate, tax_type, applies_to,
--                        sort_order, is_compound, is_default, description)
-- VALUES ('<YOUR_COMPANY_ID>', 'Excise Duty 20%', 'EXC20', 20, 'Exclusive', 'Both',
--         5, false, false, 'Excise duty on specific goods. Applied before VAT.')
-- ON CONFLICT DO NOTHING;
