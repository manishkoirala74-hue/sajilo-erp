-- Enable Row Level Security
ALTER TABLE "SalesInvoiceLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PurchaseInvoiceLine" ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to ensure clean slate)
DROP POLICY IF EXISTS "select_SalesInvoiceLine" ON "SalesInvoiceLine";
DROP POLICY IF EXISTS "select_PurchaseInvoiceLine" ON "PurchaseInvoiceLine";

-- Create SELECT policies mirroring the parent invoice permissions
CREATE POLICY "select_SalesInvoiceLine" ON "SalesInvoiceLine" 
FOR SELECT 
USING (
  (EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR 
  (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))
);

CREATE POLICY "select_PurchaseInvoiceLine" ON "PurchaseInvoiceLine" 
FOR SELECT 
USING (
  (EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR 
  (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))
);
