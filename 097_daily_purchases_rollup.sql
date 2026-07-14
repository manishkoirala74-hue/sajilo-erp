-- 097_daily_purchases_rollup.sql
-- Add total_purchases_amount to the DailyMetricsRollup table and create a trigger for PurchaseInvoices

ALTER TABLE public."DailyMetricsRollup"
ADD COLUMN IF NOT EXISTS total_purchases_amount NUMERIC(15,2) DEFAULT 0;

-- Trigger for Purchase Invoices
CREATE OR REPLACE FUNCTION trg_update_daily_purchases_rollup()
RETURNS TRIGGER AS $$
BEGIN
    -- On Insert of a Posted Purchase Invoice
    IF (TG_OP = 'INSERT' AND NEW.status = 'Posted') THEN
        INSERT INTO public."DailyMetricsRollup" (company_id, metric_date, total_purchases_amount)
        VALUES (NEW.company_id, NEW.invoice_date, NEW.grand_total)
        ON CONFLICT (company_id, metric_date) 
        DO UPDATE SET total_purchases_amount = public."DailyMetricsRollup".total_purchases_amount + NEW.grand_total;
        
    -- On Update (Status change)
    ELSIF (TG_OP = 'UPDATE') THEN
        -- Posting an invoice
        IF (NEW.status = 'Posted' AND OLD.status != 'Posted') THEN
            INSERT INTO public."DailyMetricsRollup" (company_id, metric_date, total_purchases_amount)
            VALUES (NEW.company_id, NEW.invoice_date, NEW.grand_total)
            ON CONFLICT (company_id, metric_date) 
            DO UPDATE SET total_purchases_amount = public."DailyMetricsRollup".total_purchases_amount + NEW.grand_total;
            
        -- Cancelling an already posted invoice
        ELSIF (NEW.status = 'Cancelled' AND OLD.status = 'Posted') THEN
            UPDATE public."DailyMetricsRollup"
            SET total_purchases_amount = total_purchases_amount - OLD.grand_total
            WHERE company_id = OLD.company_id AND metric_date = OLD.invoice_date;
        END IF;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_purchase_invoice_rollup ON public."PurchaseInvoice";
CREATE TRIGGER trigger_purchase_invoice_rollup
AFTER INSERT OR UPDATE ON public."PurchaseInvoice"
FOR EACH ROW EXECUTE FUNCTION trg_update_daily_purchases_rollup();

-- Seed existing data into the rollup table so purchase metrics aren't blank
INSERT INTO public."DailyMetricsRollup" (company_id, metric_date, total_purchases_amount)
SELECT company_id, invoice_date, SUM(grand_total)
FROM public."PurchaseInvoice"
WHERE status = 'Posted'
GROUP BY company_id, invoice_date
ON CONFLICT (company_id, metric_date) 
DO UPDATE SET total_purchases_amount = EXCLUDED.total_purchases_amount;

-- Force PostgREST to reload the schema cache so the frontend can query the new column immediately
NOTIFY pgrst, 'reload schema';
