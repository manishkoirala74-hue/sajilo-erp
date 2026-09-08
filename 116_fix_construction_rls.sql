-- 116_fix_construction_rls.sql
-- Replaces old, buggy RLS policies on the construction module tables with the Centralized RLS Engine.

SET search_path = public, pg_temp;

BEGIN;
LOCK TABLE "ConstructionProject" IN ACCESS EXCLUSIVE MODE;
LOCK TABLE "DeliveryChallan" IN ACCESS EXCLUSIVE MODE;
LOCK TABLE "DeliveryChallanLine" IN ACCESS EXCLUSIVE MODE;
LOCK TABLE "DocumentSequence" IN ACCESS EXCLUSIVE MODE;

-- 1. ConstructionProject
DROP POLICY IF EXISTS "select_ConstructionProject" ON "ConstructionProject";
DROP POLICY IF EXISTS "insert_ConstructionProject" ON "ConstructionProject";
DROP POLICY IF EXISTS "update_ConstructionProject" ON "ConstructionProject";
DROP POLICY IF EXISTS "delete_ConstructionProject" ON "ConstructionProject";

CREATE POLICY "select_ConstructionProject" ON "ConstructionProject" FOR SELECT TO authenticated USING (user_has_company_access(company_id));
CREATE POLICY "insert_ConstructionProject" ON "ConstructionProject" FOR INSERT TO authenticated WITH CHECK (user_has_company_access(company_id));
CREATE POLICY "update_ConstructionProject" ON "ConstructionProject" FOR UPDATE TO authenticated USING (user_has_company_access(company_id)) WITH CHECK (user_has_company_access(company_id));
CREATE POLICY "delete_ConstructionProject" ON "ConstructionProject" FOR DELETE TO authenticated USING (user_has_company_access(company_id));

-- 2. DeliveryChallan
DROP POLICY IF EXISTS "select_DeliveryChallan" ON "DeliveryChallan";
DROP POLICY IF EXISTS "insert_DeliveryChallan" ON "DeliveryChallan";
DROP POLICY IF EXISTS "update_DeliveryChallan" ON "DeliveryChallan";
DROP POLICY IF EXISTS "delete_DeliveryChallan" ON "DeliveryChallan";

CREATE POLICY "select_DeliveryChallan" ON "DeliveryChallan" FOR SELECT TO authenticated USING (user_has_company_access(company_id));
CREATE POLICY "insert_DeliveryChallan" ON "DeliveryChallan" FOR INSERT TO authenticated WITH CHECK (user_has_company_access(company_id));
CREATE POLICY "update_DeliveryChallan" ON "DeliveryChallan" FOR UPDATE TO authenticated USING (user_has_company_access(company_id)) WITH CHECK (user_has_company_access(company_id));
CREATE POLICY "delete_DeliveryChallan" ON "DeliveryChallan" FOR DELETE TO authenticated USING (user_has_company_access(company_id));

-- 3. DeliveryChallanLine
DROP POLICY IF EXISTS "select_DeliveryChallanLine" ON "DeliveryChallanLine";
DROP POLICY IF EXISTS "insert_DeliveryChallanLine" ON "DeliveryChallanLine";
DROP POLICY IF EXISTS "update_DeliveryChallanLine" ON "DeliveryChallanLine";
DROP POLICY IF EXISTS "delete_DeliveryChallanLine" ON "DeliveryChallanLine";

CREATE POLICY "select_DeliveryChallanLine" ON "DeliveryChallanLine" FOR SELECT TO authenticated USING (user_has_company_access(company_id));
CREATE POLICY "insert_DeliveryChallanLine" ON "DeliveryChallanLine" FOR INSERT TO authenticated WITH CHECK (user_has_company_access(company_id));
CREATE POLICY "update_DeliveryChallanLine" ON "DeliveryChallanLine" FOR UPDATE TO authenticated USING (user_has_company_access(company_id)) WITH CHECK (user_has_company_access(company_id));
CREATE POLICY "delete_DeliveryChallanLine" ON "DeliveryChallanLine" FOR DELETE TO authenticated USING (user_has_company_access(company_id));

-- 4. DocumentSequence (Construction)
DROP POLICY IF EXISTS "select_DocumentSequence" ON "DocumentSequence";
DROP POLICY IF EXISTS "insert_DocumentSequence" ON "DocumentSequence";
DROP POLICY IF EXISTS "update_DocumentSequence" ON "DocumentSequence";
DROP POLICY IF EXISTS "delete_DocumentSequence" ON "DocumentSequence";

CREATE POLICY "select_DocumentSequence" ON "DocumentSequence" FOR SELECT TO authenticated USING (user_has_company_access(company_id));
CREATE POLICY "insert_DocumentSequence" ON "DocumentSequence" FOR INSERT TO authenticated WITH CHECK (user_has_company_access(company_id));
CREATE POLICY "update_DocumentSequence" ON "DocumentSequence" FOR UPDATE TO authenticated USING (user_has_company_access(company_id)) WITH CHECK (user_has_company_access(company_id));
CREATE POLICY "delete_DocumentSequence" ON "DocumentSequence" FOR DELETE TO authenticated USING (user_has_company_access(company_id));

COMMIT;

NOTIFY pgrst, 'reload schema';
