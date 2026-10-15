-- Migration: 139_guarantee_company_main_godown.sql
-- Description: Guarantees that every company has an active Main Location Godown and creates an automatic trigger on Company insertion.

-- 1. Backfill: Guarantee that all existing companies have a designated Main Godown
DO $$
DECLARE
    comp RECORD;
    v_godown_id UUID;
BEGIN
    FOR comp IN SELECT id, name FROM public."Company" LOOP
        -- Case A: Company has zero godowns
        IF NOT EXISTS (SELECT 1 FROM public."Godown" WHERE company_id = comp.id) THEN
            INSERT INTO public."Godown" (company_id, name, godown_name, is_main, status)
            VALUES (comp.id, 'Main Location', 'Main Location', true, 'Active')
            RETURNING id INTO v_godown_id;
            RAISE NOTICE 'Provisioned Main Location for company % (%)', comp.name, comp.id;
        ELSE
            -- Case B: Company has godowns, but none is flagged as is_main = true
            IF NOT EXISTS (SELECT 1 FROM public."Godown" WHERE company_id = comp.id AND is_main = true) THEN
                UPDATE public."Godown" 
                SET is_main = true 
                WHERE id = (
                    SELECT id FROM public."Godown" 
                    WHERE company_id = comp.id 
                    ORDER BY CASE WHEN name ILIKE '%main%' THEN 0 ELSE 1 END, created_at ASC 
                    LIMIT 1
                );
                RAISE NOTICE 'Designated existing godown as is_main for company % (%)', comp.name, comp.id;
            END IF;
        END IF;
    END LOOP;
END $$;

-- 2. Trigger Function: Automatically provision a default Main Location upon new company creation
CREATE OR REPLACE FUNCTION public.auto_provision_company_main_godown()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public."Godown" WHERE company_id = NEW.id) THEN
        INSERT INTO public."Godown" (company_id, name, godown_name, is_main, status)
        VALUES (NEW.id, 'Main Location', 'Main Location', true, 'Active');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 3. Attach trigger to Company table
DROP TRIGGER IF EXISTS trg_auto_provision_main_godown ON public."Company";
CREATE TRIGGER trg_auto_provision_main_godown
    AFTER INSERT ON public."Company"
    FOR EACH ROW
    EXECUTE FUNCTION public.auto_provision_company_main_godown();
