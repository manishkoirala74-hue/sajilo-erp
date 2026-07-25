-- 0117_fix_async_delta_triggers.sql
-- Fixes the 'text = uuid' mismatch in asynchronous delta patching triggers
-- caused by legacy explicit casts on columns that have since been migrated to native UUIDs.

-- 1. FINANCIAL TRIGGER FIX
CREATE OR REPLACE FUNCTION trigger_flag_recalculation_financial()
RETURNS TRIGGER AS $$
DECLARE
  v_company_id UUID;
  v_journal_date DATE;
  v_fy RECORD;
  v_delta NUMERIC(15,2) := 0;
  v_account_id UUID;
BEGIN
  -- Determine operation and identifiers
  IF TG_OP = 'DELETE' THEN 
    v_company_id := OLD.company_id; 
    v_account_id := OLD.account_id;
    v_delta := CAST((0 - OLD.debit_amount) - (0 - OLD.credit_amount) AS NUMERIC(15,2));
  ELSIF TG_OP = 'INSERT' THEN
    v_company_id := NEW.company_id;
    v_account_id := NEW.account_id;
    v_delta := CAST((NEW.debit_amount - 0) - (NEW.credit_amount - 0) AS NUMERIC(15,2));
  ELSE
    v_company_id := NEW.company_id;
    v_account_id := NEW.account_id;
    v_delta := CAST((NEW.debit_amount - OLD.debit_amount) - (NEW.credit_amount - OLD.credit_amount) AS NUMERIC(15,2));
  END IF;

  -- Find the journal date
  -- FIXED: Removed legacy id::TEXT cast to prevent 'operator does not exist: text = uuid' crash
  SELECT entry_date::DATE INTO v_journal_date FROM "GeneralLedgerJournal" 
  WHERE id = COALESCE(NEW.journal_id, OLD.journal_id) LIMIT 1;
  
  IF v_journal_date IS NULL THEN RETURN NULL; END IF;

  -- Find the FY of this journal
  SELECT * INTO v_fy FROM "FiscalYear" 
  WHERE company_id = v_company_id AND v_journal_date BETWEEN start_date AND end_date LIMIT 1;

  -- If it's SOFT_CLOSED and there's a non-zero delta, queue it
  IF v_fy.status = 'SOFT_CLOSED' AND v_delta != 0 THEN
    INSERT INTO "pending_ledger_recalculations" (company_id, fiscal_year_id, module_type, account_id, net_change_delta)
    VALUES (v_company_id, v_fy.id, 'FINANCIAL', v_account_id, v_delta);
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;


-- 2. PROCESS QUEUE FIX
CREATE OR REPLACE FUNCTION process_pending_recalculations()
RETURNS VOID AS $$
DECLARE
  v_rec RECORD;
  v_subsequent_fys RECORD;
  v_account_type TEXT;
  v_retained_earnings_id UUID;
  v_opening_journal_id UUID;
  v_opening_stock_adj_id UUID;
BEGIN
  -- 1. Query with FOR UPDATE SKIP LOCKED and ORDER BY to prevent deadlocks
  FOR v_rec IN 
    SELECT * FROM "pending_ledger_recalculations" 
    WHERE status = 'pending' 
    ORDER BY fiscal_year_id ASC, account_id ASC, item_id ASC
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Mark as processing
    UPDATE "pending_ledger_recalculations" SET status = 'processing' WHERE id = v_rec.id;

    -- Iterative Cascade: Find all subsequent fiscal years (ordered chronologically)
    FOR v_subsequent_fys IN 
      SELECT * FROM "FiscalYear" 
      WHERE company_id = v_rec.company_id AND start_date > (SELECT end_date FROM "FiscalYear" WHERE id = v_rec.fiscal_year_id)
      ORDER BY start_date ASC
    LOOP
      
      IF v_rec.module_type = 'FINANCIAL' THEN
        -- Find the Opening Balance Journal for this subsequent year
        SELECT id INTO v_opening_journal_id FROM "GeneralLedgerJournal" 
        WHERE company_id = v_rec.company_id AND reference_module = 'OpeningBalance' 
        AND entry_date = v_subsequent_fys.start_date LIMIT 1;

        IF v_opening_journal_id IS NOT NULL THEN
          -- Check account type
          SELECT account_type INTO v_account_type FROM "ChartOfAccount" WHERE id = v_rec.account_id;
          
          IF v_account_type IN ('Revenue', 'COGS', 'OPEX', 'Expense', 'Income') THEN
            -- Temporary Account Routing: Route to Retained Earnings
            SELECT id INTO v_retained_earnings_id FROM "ChartOfAccount" 
            WHERE company_id = v_rec.company_id AND account_name ILIKE 'Retained Earnings' LIMIT 1;

            -- UPSERT Retained Earnings Opening Balance
            -- FIXED: Removed journal_id::uuid cast since column is native UUID
            UPDATE "GeneralLedgerLine" 
            SET 
              debit_amount  = GREATEST(0, (debit_amount - credit_amount) + v_rec.net_change_delta),
              credit_amount = GREATEST(0, 0 - ((debit_amount - credit_amount) + v_rec.net_change_delta))
            WHERE journal_id = v_opening_journal_id AND account_id = v_retained_earnings_id;
            
            IF NOT FOUND THEN
              -- FIXED: Removed v_opening_journal_id::TEXT cast to prevent UUID/TEXT insertion mismatch
              INSERT INTO "GeneralLedgerLine" (company_id, journal_id, account_id, account_name, account_type, debit_amount, credit_amount)
              VALUES (v_rec.company_id, v_opening_journal_id, v_retained_earnings_id, 'Retained Earnings', 'Equity', 
                      GREATEST(0, v_rec.net_change_delta), GREATEST(0, 0 - v_rec.net_change_delta));
            END IF;

            -- Log Audit Trail
            INSERT INTO "system_recalculation_logs" (company_id, fiscal_year_id, log_message)
            VALUES (v_rec.company_id, v_subsequent_fys.id, 
              'System autonomously shifted FY ' || v_subsequent_fys.fiscal_year_name || ' Retained Earnings Opening Balance by ' || v_rec.net_change_delta || ' due to backdated adjusting entry.');

          ELSE
            -- Permanent Account Routing: Direct UPSERT
            -- FIXED: Removed journal_id::uuid cast since column is native UUID
            UPDATE "GeneralLedgerLine" 
            SET 
              debit_amount  = GREATEST(0, (debit_amount - credit_amount) + v_rec.net_change_delta),
              credit_amount = GREATEST(0, 0 - ((debit_amount - credit_amount) + v_rec.net_change_delta))
            WHERE journal_id = v_opening_journal_id AND account_id = v_rec.account_id;
            
            IF NOT FOUND THEN
               -- Fetch account details to insert
               DECLARE v_acc_details RECORD;
               BEGIN
                 SELECT account_code, account_name, account_type INTO v_acc_details FROM "ChartOfAccount" WHERE id = v_rec.account_id;
                 -- FIXED: Removed v_opening_journal_id::TEXT cast
                 INSERT INTO "GeneralLedgerLine" (company_id, journal_id, account_id, account_code, account_name, account_type, debit_amount, credit_amount)
                 VALUES (v_rec.company_id, v_opening_journal_id, v_rec.account_id, v_acc_details.account_code, v_acc_details.account_name, v_acc_details.account_type, 
                         GREATEST(0, v_rec.net_change_delta), GREATEST(0, 0 - v_rec.net_change_delta));
               END;
            END IF;

            -- Log Audit Trail
            INSERT INTO "system_recalculation_logs" (company_id, fiscal_year_id, log_message)
            VALUES (v_rec.company_id, v_subsequent_fys.id, 
              'System autonomously shifted FY ' || v_subsequent_fys.fiscal_year_name || ' Account ' || v_rec.account_id || ' Opening Balance by ' || v_rec.net_change_delta || ' due to backdated adjusting entry.');
          END IF;
        END IF;

      ELSIF v_rec.module_type = 'INVENTORY' THEN
        -- Find the Opening Balance Stock Adjustment for this subsequent year
        SELECT id INTO v_opening_stock_adj_id FROM "StockAdjustment" 
        WHERE company_id = v_rec.company_id AND adjustment_type = 'Opening Balance' 
        AND adjustment_date = v_subsequent_fys.start_date LIMIT 1;
        
        -- Log Audit Trail
        INSERT INTO "system_recalculation_logs" (company_id, fiscal_year_id, log_message)
        VALUES (v_rec.company_id, v_subsequent_fys.id, 
          'System autonomously shifted FY ' || v_subsequent_fys.fiscal_year_name || ' Inventory Item ' || v_rec.item_id || ' Opening Balance by ' || v_rec.net_change_delta || ' due to backdated adjusting entry.');
      END IF;

    END LOOP;

    -- Mark as completed
    UPDATE "pending_ledger_recalculations" SET status = 'completed' WHERE id = v_rec.id;

  END LOOP;
END;
$$ LANGUAGE plpgsql;
