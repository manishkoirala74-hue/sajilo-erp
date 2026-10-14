import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const client = createClient(process.env.VITE_SAJILO_APP_BASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const tables = [
  'Company', 'User', 'UserCompany', 'Role', 'CompanyRole', 'CompanySettings',
  'FiscalYear', 'ChartOfAccount', 'Item', 'BusinessPartner', 'Godown',
  'FinancialVoucher', 'FinancialVoucherLine',
  'SalesInvoice', 'SalesInvoiceItem',
  'PurchaseInvoice', 'PurchaseInvoiceItem',
  'POSSale', 'POSSaleItem',
  'StockTransfer', 'StockTransferItem',
  'StockAdjustment', 'StockAdjustmentItem',
  'GeneralLedger', 'GeneralLedgerLine',
  'DailyMetricsRollup', 'AuditLog'
];

async function checkAll() {
  console.log('--- Table Row Counts ---');
  for (const t of tables) {
    try {
      const { count, error } = await client.from(t).select('*', { count: 'exact', head: true });
      if (error) {
        console.log(`${t.padEnd(25)}: ERROR (${error.message})`);
      } else {
        console.log(`${t.padEnd(25)}: ${count} rows`);
      }
    } catch (e) {
      console.log(`${t.padEnd(25)}: EXCEPTION (${e.message})`);
    }
  }
}
checkAll();
