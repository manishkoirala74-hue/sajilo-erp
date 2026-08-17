-- ============================================================================
-- CompanySettings Initialization & Hardening
-- ============================================================================

-- 1. Hardening: Ensure company_id is strictly unique per company to prevent race conditions during Upserts
-- If duplicate rows already exist (unlikely but possible), this will fail until manually cleaned up.
ALTER TABLE "CompanySettings" DROP CONSTRAINT IF EXISTS unique_company_settings;
ALTER TABLE "CompanySettings" ADD CONSTRAINT unique_company_settings UNIQUE (company_id);

-- 2. Retroactive Backfill: Rescue existing companies (e.g. Devi Traders) that lack settings rows
INSERT INTO "CompanySettings" (company_id, company_name)
SELECT id, name 
FROM "Company" 
WHERE id NOT IN (SELECT company_id FROM "CompanySettings" WHERE company_id IS NOT NULL);

-- 3. The Future Trigger: Automatically initialize CompanySettings when a new Company is created
CREATE OR REPLACE FUNCTION public.create_default_company_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO "CompanySettings" (company_id, company_name)
  VALUES (NEW.id, NEW.name)
  ON CONFLICT (company_id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_company_created ON "Company";
CREATE TRIGGER on_company_created
  AFTER INSERT ON "Company"
  FOR EACH ROW
  EXECUTE FUNCTION public.create_default_company_settings();
