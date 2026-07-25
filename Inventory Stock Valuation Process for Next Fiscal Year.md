# Walkthrough: Fixing the Real-Time Inventory Snapshot Bug

We have successfully executed the implementation plan to correct the critical inventory carry-over flaw in the Year-End Closing RPC.

## Changes Made

1. **Updated the SQL RPC script:** We modified `0116_fix_fiscal_year_close_rpc.sql` to replace the real-time `Item` table query with a highly precise, time-locked query against `InventoryLedger`.
2. **Applied the "Zero-Balance" Guardrail:** We ensured the query explicitly calculates `HAVING SUM(in_qty - out_qty) > 0` before aggregating, meaning items with net-zero stock are correctly ignored.
3. **Applied the Empty Voucher Guardrail:** We wrapped the `INSERT` block in an `IF EXISTS` check to guarantee that if a company has zero historical positive inventory, the system will completely skip generating an empty StockAdjustment voucher.
4. **Applied the Null Cost Guardrail:** We mapped the financial valuation to `i.cost_price` and wrapped it in `COALESCE(i.cost_price, 0)` so that legacy items with missing cost definitions gracefully default to 0 instead of crashing the UI with literal nulls.

## Verification

The next time you deploy this SQL patch and execute the Year-End Closing Wizard:
1. It will safely ignore any transactions that occurred during the `SOFT_CLOSED` grace period (e.g., Shrawan 1 - 15).
2. It will generate a precise Opening Balance voucher that reflects stock quantities exactly as they stood on Ashadh 31.
3. You can verify this by opening the new Opening Balance stock adjustment in the UI and confirming that the total asset valuation exactly matches your Balance Sheet.

---

## ⚠️ Rollback Plan

If you encounter any unforeseen errors during the SQL deployment or if the new logic behaves unexpectedly, follow this rollback plan to revert the RPC to its previous state safely.

### 1. Identify the Failure
If the `close_and_open_fiscal_year` RPC throws an error during execution or generates malformed Opening Balance vouchers, instruct your users to pause all closing operations.

### 2. Revert the SQL Script
You can revert the "Step 4: Inventory Carry-Over" block back to the simpler, real-time query we originally used. Open `0116_fix_fiscal_year_close_rpc.sql` and replace the complex `IF EXISTS` block with the original baseline:

```sql
  -- 4. Inventory Carry-Over (Original Baseline)
  INSERT INTO "StockAdjustment" (company_id, adjustment_number, adjustment_date, adjustment_type, reason, status, line_items)
  SELECT p_company_id, 'OPEN-' || v_new_fy.fiscal_year_name, v_new_fy.start_date, 'Opening Balance', 'Year End Carry-over', 'Posted',
    jsonb_agg(
      jsonb_build_object(
        'item_id', id, 'item_code', item_code, 'item_name', item_name,
        'quantity', quantity_on_hand, 'unit_cost', 0
      )
    )
  FROM "Item" WHERE company_id = p_company_id AND quantity_on_hand > 0;
```

### 3. Re-Deploy and Re-Run
Run the modified `0116_fix_fiscal_year_close_rpc.sql` script in your Supabase SQL Editor.
Because the RPC is idempotent, you can simply click **Execute Year-End Close** in the UI again. The RPC will automatically delete the malformed closing/opening journals and regenerate them using the reverted logic.
