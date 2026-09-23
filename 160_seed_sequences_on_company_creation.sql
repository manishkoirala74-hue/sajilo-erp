-- 160_seed_sequences_on_company_creation.sql
-- Seeds DocumentSequenceConfig rows at company creation time.
-- Eliminates the gap where non-admin users had no sequence config until
-- an admin manually visited the VoucherSequence settings page.

BEGIN;

CREATE OR REPLACE FUNCTION public.seed_default_document_sequences()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public."DocumentSequenceConfig"
    (company_id, document_type, document_label, prefix, padding, include_fy_prefix, starting_number, is_active)
  VALUES
    (NEW.id, 'SalesInvoice',    'Sales Invoice',     'SI',  5, true, 1, true),
    (NEW.id, 'PurchaseInvoice', 'Purchase Invoice',  'PI',  5, true, 1, true),
    (NEW.id, 'SalesOrder',      'Sales Order',       'SO',  5, true, 1, true),
    (NEW.id, 'PurchaseOrder',   'Purchase Order',    'PO',  5, true, 1, true),
    (NEW.id, 'Quotation',       'Quotation',         'QT',  5, true, 1, true),
    (NEW.id, 'Receipt',         'Receipt Voucher',   'RV',  5, true, 1, true),
    (NEW.id, 'Payment',         'Payment Voucher',   'PV',  5, true, 1, true),
    (NEW.id, 'Journal',         'Journal Voucher',   'JV',  5, true, 1, true),
    (NEW.id, 'Contra',          'Contra Voucher',    'CV',  5, true, 1, true),
    (NEW.id, 'StockAdjustment', 'Stock Adjustment',  'ADJ', 5, true, 1, true)
  ON CONFLICT (company_id, document_type) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_company_created_seed_sequences ON public."Company";
CREATE TRIGGER on_company_created_seed_sequences
  AFTER INSERT ON public."Company"
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_default_document_sequences();

-- Retroactive backfill: seed existing companies missing sequence rows
INSERT INTO public."DocumentSequenceConfig"
  (company_id, document_type, document_label, prefix, padding, include_fy_prefix, starting_number, is_active)
SELECT
  c.id,
  dt.document_type,
  dt.document_label,
  dt.prefix,
  5, true, 1, true
FROM public."Company" c
CROSS JOIN (VALUES
  ('SalesInvoice',    'Sales Invoice',    'SI'),
  ('PurchaseInvoice', 'Purchase Invoice', 'PI'),
  ('SalesOrder',      'Sales Order',      'SO'),
  ('PurchaseOrder',   'Purchase Order',   'PO'),
  ('Quotation',       'Quotation',        'QT'),
  ('Receipt',         'Receipt Voucher',  'RV'),
  ('Payment',         'Payment Voucher',  'PV'),
  ('Journal',         'Journal Voucher',  'JV'),
  ('Contra',          'Contra Voucher',   'CV'),
  ('StockAdjustment', 'Stock Adjustment', 'ADJ')
) AS dt(document_type, document_label, prefix)
ON CONFLICT (company_id, document_type) DO NOTHING;

COMMIT;
