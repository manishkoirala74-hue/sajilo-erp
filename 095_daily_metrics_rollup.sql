-- 095_daily_metrics_rollup.sql
-- Creates the DailyMetricsRollup table and triggers for real-time dashboard speeds

CREATE TABLE IF NOT EXISTS public."DailyMetricsRollup" (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES public."Company"(id),
    metric_date DATE NOT NULL DEFAULT CURRENT_DATE,
    total_sales_amount NUMERIC(15,2) DEFAULT 0,
    total_inventory_value NUMERIC(15,2) DEFAULT 0,
    UNIQUE(company_id, metric_date)
);

-- Indexes for blazing fast dashboard reads
CREATE INDEX IF NOT EXISTS idx_dailymetrics_company_date 
ON public."DailyMetricsRollup"(company_id, metric_date);

-- 1. Trigger for Sales Invoices
CREATE OR REPLACE FUNCTION trg_update_daily_sales_rollup()
RETURNS TRIGGER AS $$
BEGIN
    -- On Insert of a Posted Invoice
    IF (TG_OP = 'INSERT' AND NEW.status = 'Posted') THEN
        INSERT INTO public."DailyMetricsRollup" (company_id, metric_date, total_sales_amount)
        VALUES (NEW.company_id, NEW.invoice_date, NEW.grand_total)
        ON CONFLICT (company_id, metric_date) 
        DO UPDATE SET total_sales_amount = public."DailyMetricsRollup".total_sales_amount + NEW.grand_total;
        
    -- On Update (Status change)
    ELSIF (TG_OP = 'UPDATE') THEN
        -- Posting an invoice
        IF (NEW.status = 'Posted' AND OLD.status != 'Posted') THEN
            INSERT INTO public."DailyMetricsRollup" (company_id, metric_date, total_sales_amount)
            VALUES (NEW.company_id, NEW.invoice_date, NEW.grand_total)
            ON CONFLICT (company_id, metric_date) 
            DO UPDATE SET total_sales_amount = public."DailyMetricsRollup".total_sales_amount + NEW.grand_total;
            
        -- Cancelling an already posted invoice
        ELSIF (NEW.status = 'Cancelled' AND OLD.status = 'Posted') THEN
            UPDATE public."DailyMetricsRollup"
            SET total_sales_amount = total_sales_amount - OLD.grand_total
            WHERE company_id = OLD.company_id AND metric_date = OLD.invoice_date;
        END IF;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sales_invoice_rollup ON public."SalesInvoice";
CREATE TRIGGER trigger_sales_invoice_rollup
AFTER INSERT OR UPDATE ON public."SalesInvoice"
FOR EACH ROW EXECUTE FUNCTION trg_update_daily_sales_rollup();

-- Seed existing data into the rollup table so dashboards aren't blank
INSERT INTO public."DailyMetricsRollup" (company_id, metric_date, total_sales_amount)
SELECT company_id, invoice_date, SUM(grand_total)
FROM public."SalesInvoice"
WHERE status = 'Posted'
GROUP BY company_id, invoice_date
ON CONFLICT (company_id, metric_date) 
DO UPDATE SET total_sales_amount = EXCLUDED.total_sales_amount;
