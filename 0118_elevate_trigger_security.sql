-- 0118_elevate_trigger_security.sql
-- ZERO-TRUST SCHEMA VERSION WITH SECURITY DEFINER

CREATE OR REPLACE FUNCTION trigger_flag_recalculation_financial()
RETURNS TRIGGER 
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_journal_date DATE;
  v_fy RECORD;
  v_delta NUMERIC(15,2) := 0;
  v_account_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN 
    v_company_id := OLD.company_id; v_account_id := OLD.account_id;
    v_delta := CAST((0 - OLD.debit_amount) - (0 - OLD.credit_amount) AS NUMERIC(15,2));
  ELSIF TG_OP = 'INSERT' THEN
    v_company_id := NEW.company_id; v_account_id := NEW.account_id;
    v_delta := CAST((NEW.debit_amount - 0) - (NEW.credit_amount - 0) AS NUMERIC(15,2));
  ELSE
    v_company_id := NEW.company_id; v_account_id := NEW.account_id;
    v_delta := CAST((NEW.debit_amount - OLD.debit_amount) - (NEW.credit_amount - OLD.credit_amount) AS NUMERIC(15,2));
  END IF;

  -- ZERO-TRUST: Cast the COALESCE output to UUID explicitly
  SELECT entry_date::DATE INTO v_journal_date FROM "GeneralLedgerJournal" 
  WHERE id = COALESCE(NEW.journal_id, OLD.journal_id)::uuid LIMIT 1;
  
  IF v_journal_date IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO v_fy FROM "FiscalYear" 
  WHERE company_id = v_company_id AND v_journal_date BETWEEN start_date AND end_date LIMIT 1;

  IF v_fy.status = 'SOFT_CLOSED' AND v_delta != 0 THEN
    INSERT INTO "pending_ledger_recalculations" (company_id, fiscal_year_id, module_type, account_id, net_change_delta)
    VALUES (v_company_id, v_fy.id, 'FINANCIAL', v_account_id, v_delta);
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trigger_flag_recalculation_inventory()
RETURNS TRIGGER 
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_transaction_date DATE;
  v_fy RECORD;
  v_delta NUMERIC(15,2) := 0;
  v_item_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN 
    v_company_id := OLD.company_id; v_item_id := OLD.item_id;
    v_delta := CAST(0 - (OLD.quantity_in - OLD.quantity_out) AS NUMERIC(15,2));
  ELSIF TG_OP = 'INSERT' THEN
    v_company_id := NEW.company_id; v_item_id := NEW.item_id;
    v_delta := CAST((NEW.quantity_in - NEW.quantity_out) AS NUMERIC(15,2));
  ELSE
    v_company_id := NEW.company_id; v_item_id := NEW.item_id;
    v_delta := CAST((NEW.quantity_in - NEW.quantity_out) - (OLD.quantity_in - OLD.quantity_out) AS NUMERIC(15,2));
  END IF;

  v_transaction_date := COALESCE(NEW.transaction_date, OLD.transaction_date);

  SELECT * INTO v_fy FROM "FiscalYear" 
  WHERE company_id = v_company_id AND v_transaction_date BETWEEN start_date AND end_date LIMIT 1;

  IF v_fy.status = 'SOFT_CLOSED' AND v_delta != 0 THEN
    INSERT INTO "pending_ledger_recalculations" (company_id, fiscal_year_id, module_type, item_id, net_change_delta)
    VALUES (v_company_id, v_fy.id, 'INVENTORY', v_item_id, v_delta);
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION process_pending_recalculations()
RETURNS VOID 
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_rec RECORD;
  v_subsequent_fys RECORD;
  v_account_type TEXT;
  v_retained_earnings_id UUID;
  v_opening_journal_id UUID;
  v_opening_stock_adj_id UUID;
BEGIN
  FOR v_rec IN 
    SELECT * FROM "pending_ledger_recalculations" WHERE status = 'pending' 
    ORDER BY fiscal_year_id ASC, account_id ASC, item_id ASC FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE "pending_ledger_recalculations" SET status = 'processing' WHERE id = v_rec.id;

    FOR v_subsequent_fys IN 
      SELECT * FROM "FiscalYear" WHERE company_id = v_rec.company_id AND start_date > (SELECT end_date FROM "FiscalYear" WHERE id = v_rec.fiscal_year_id) ORDER BY start_date ASC
    LOOP
      IF v_rec.module_type = 'FINANCIAL' THEN
        SELECT id INTO v_opening_journal_id FROM "GeneralLedgerJournal" 
        WHERE company_id = v_rec.company_id AND reference_module = 'OpeningBalance' AND entry_date = v_subsequent_fys.start_date LIMIT 1;

        IF v_opening_journal_id IS NOT NULL THEN
          SELECT account_type INTO v_account_type FROM "ChartOfAccount" WHERE id = v_rec.account_id;
          
          IF v_account_type IN ('Revenue', 'COGS', 'OPEX', 'Expense', 'Income') THEN
            SELECT id INTO v_retained_earnings_id FROM "ChartOfAccount" WHERE company_id = v_rec.company_id AND account_name ILIKE 'Retained Earnings' LIMIT 1;

            -- ZERO-TRUST: Explicitly cast left side to UUID to hit Expression Indexes
            UPDATE "GeneralLedgerLine" SET 
              debit_amount  = GREATEST(0, (debit_amount - credit_amount) + v_rec.net_change_delta),
              credit_amount = GREATEST(0, 0 - ((debit_amount - credit_amount) + v_rec.net_change_delta))
            WHERE journal_id::uuid = v_opening_journal_id AND account_id::uuid = v_retained_earnings_id;
            
            IF NOT FOUND THEN
              INSERT INTO "GeneralLedgerLine" (company_id, journal_id, account_id, account_name, account_type, debit_amount, credit_amount)
              VALUES (v_rec.company_id, v_opening_journal_id, v_retained_earnings_id, 'Retained Earnings', 'Equity', GREATEST(0, v_rec.net_change_delta), GREATEST(0, 0 - v_rec.net_change_delta));
            END IF;
          ELSE
            -- ZERO-TRUST: Explicitly cast left side to UUID to hit Expression Indexes
            UPDATE "GeneralLedgerLine" SET 
              debit_amount  = GREATEST(0, (debit_amount - credit_amount) + v_rec.net_change_delta),
              credit_amount = GREATEST(0, 0 - ((debit_amount - credit_amount) + v_rec.net_change_delta))
            WHERE journal_id::uuid = v_opening_journal_id AND account_id::uuid = v_rec.account_id;
            
            IF NOT FOUND THEN
               DECLARE v_acc_details RECORD;
               BEGIN
                 SELECT account_code, account_name, account_type INTO v_acc_details FROM "ChartOfAccount" WHERE id = v_rec.account_id;
                 INSERT INTO "GeneralLedgerLine" (company_id, journal_id, account_id, account_code, account_name, account_type, debit_amount, credit_amount)
                 VALUES (v_rec.company_id, v_opening_journal_id, v_rec.account_id, v_acc_details.account_code, v_acc_details.account_name, v_acc_details.account_type, GREATEST(0, v_rec.net_change_delta), GREATEST(0, 0 - v_rec.net_change_delta));
               END;
            END IF;
          END IF;
        END IF;

      ELSIF v_rec.module_type = 'INVENTORY' THEN
        SELECT id INTO v_opening_stock_adj_id FROM "StockAdjustment" 
        WHERE company_id = v_rec.company_id AND adjustment_type = 'Opening Balance' 
        AND adjustment_date = v_subsequent_fys.start_date LIMIT 1;
      END IF;
    END LOOP;
    UPDATE "pending_ledger_recalculations" SET status = 'completed' WHERE id = v_rec.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;
