import { queryClientInstance } from '@/lib/query-client';
import { sajilo } from '@/api/sajiloClient';

/**
 * Enterprise Route & Foundational Data Prefetcher (Pillar 4)
 * 
 * Silently warms Vite lazy-loaded component chunks and foundational TanStack queries
 * upon user hover (Sidebar) or active keyboard selection (Command Palette).
 * Eliminates route-transition latency and network waterfalls before click/Enter occurs.
 */

const prefetchedChunks = new Set();
const prefetchedQueries = new Set();

// Mapping of application paths to their lazy-loaded component dynamic imports
const CHUNK_LOADERS = {
  '/': () => import('@/pages/Dashboard'),
  '/partners': () => import('@/pages/partners/BusinessPartners'),
  '/partners/customers': () => import('@/pages/partners/Customers'),
  '/partners/suppliers': () => import('@/pages/partners/Suppliers'),
  '/inventory/items': () => import('@/pages/inventory/Items'),
  '/inventory/transfers': () => import('@/pages/inventory/StockTransfers'),
  '/inventory/categories': () => import('@/pages/inventory/Categories'),
  '/inventory/godowns': () => import('@/pages/inventory/Godowns'),
  '/inventory/uom': () => import('@/pages/inventory/UnitOfMeasures'),
  '/inventory/discounts': () => import('@/pages/inventory/DiscountSchemes'),
  '/inventory/adjustments': () => import('@/pages/inventory/StockAdjustments'),
  '/inventory/price-revision': () => import('@/pages/inventory/PriceRevisionWizard'),
  '/inventory/assembly': () => import('@/pages/inventory/StockAssemblyList'),
  '/pos': () => import('@/pages/pos/POSSales'),
  '/purchase/orders': () => import('@/pages/purchase/PurchaseOrders'),
  '/purchase/invoices': () => import('@/pages/purchase/PurchaseInvoices'),
  '/purchase/returns': () => import('@/pages/purchase/PurchaseReturns'),
  '/sales/quotations': () => import('@/pages/sales/Quotations'),
  '/sales/orders': () => import('@/pages/sales/SalesOrders'),
  '/sales/invoices': () => import('@/pages/sales/SalesInvoices'),
  '/sales/returns': () => import('@/pages/sales/SalesReturns'),
  '/reports': () => import('@/pages/Reports'),
  '/reports/accounting/day-book': () => import('@/pages/reports/DayBookReport'),
  '/reports/accounting/bank-reconciliation': () => import('@/pages/reports/BankReconciliationReport'),
  '/reports/employee-receivables': () => import('@/pages/reports/EmployeeReceivableReport'),
  '/reports/employee-payables': () => import('@/pages/reports/EmployeePayableReport'),
  '/reports/communication-logs': () => import('@/pages/reports/CommunicationLogs'),
  '/reports/price-revision-history': () => import('@/pages/reports/PriceRevisionHistory'),
  '/reports/inventory-turnover': () => import('@/pages/reports/InventoryTurnoverReport'),
  '/reports/inventory/gross-profit-margin': () => import('@/pages/reports/GrossProfitMarginReport'),
  '/reports/customer-bill-due': () => import('@/pages/reports/CustomerBillDue'),
  '/reports/supplier-bill-due': () => import('@/pages/reports/SupplierBillDue'),
  '/reports/purchase-price-change-history': () => import('@/pages/reports/PurchasePriceChangeHistory'),
  '/reports/inventory/negative-stock-exceptions': () => import('@/pages/reports/NegativeStockExceptionReport'),
  '/accounting/chart-of-accounts': () => import('@/pages/accounting/ChartOfAccounts'),
  '/accounting/general-ledger': () => import('@/pages/accounting/GeneralLedger'),
  '/treasury/vouchers': () => import('@/pages/treasury/FinancialVouchers'),
  '/treasury/bank-accounts': () => import('@/pages/treasury/BankAccounts'),
  '/assets/register': () => import('@/pages/assets/FixedAssets'),
  '/assets/depreciation': () => import('@/pages/assets/DepreciationSchedules'),
  '/assets/compliance': () => import('@/pages/assets/AssetCompliance'),
  '/hr/employees': () => import('@/pages/hr/Employees'),
  '/hr/leave': () => import('@/pages/hr/LeaveManagement'),
  '/hr/attendance': () => import('@/pages/hr/AttendanceTracking'),
  '/hr/payroll': () => import('@/pages/hr/PayrollRuns'),
  '/hr/loans': () => import('@/pages/hr/LoansAdvances'),
  '/hr/documents': () => import('@/pages/hr/HRDocuments'),
  '/settings': () => import('@/pages/settings/SettingsLayout'),
  '/help-support': () => import('@/pages/HelpSupport'),
  '/profile': () => import('@/pages/Profile'),
};

// Foundational query prefetch definitions for high-frequency operational tables
const QUERY_PREFETCH_MAP = {
  '/inventory/items': async (companyId) => {
    return queryClientInstance.prefetchQuery({
      queryKey: ['company', companyId, 'Item', 'items'],
      queryFn: async () => {
        const data = await sajilo.entities.Item.filter({ is_active: true }, '-created_at', 1000);
        return data || [];
      },
      staleTime: 5 * 60 * 1000,
    });
  },
  '/partners/customers': async (companyId) => {
    return queryClientInstance.prefetchQuery({
      queryKey: ['company', companyId, 'BusinessPartner', 'customers'],
      queryFn: async () => {
        const data = await sajilo.entities.BusinessPartner.filter({ is_customer: true }, '-created_at', 1000);
        return data || [];
      },
      staleTime: 5 * 60 * 1000,
    });
  },
  '/partners/suppliers': async (companyId) => {
    return queryClientInstance.prefetchQuery({
      queryKey: ['company', companyId, 'BusinessPartner', 'vendors'],
      queryFn: async () => {
        const data = await sajilo.entities.BusinessPartner.filter({ is_vendor: true }, '-created_at', 1000);
        return data || [];
      },
      staleTime: 5 * 60 * 1000,
    });
  },
  '/accounting/chart-of-accounts': async (companyId) => {
    return queryClientInstance.prefetchQuery({
      queryKey: ['company', companyId, 'Account', 'accounts'],
      queryFn: async () => {
        const data = await sajilo.entities.Account.filter({ is_active: true }, 'code', 1000);
        return data || [];
      },
      staleTime: 5 * 60 * 1000,
    });
  },
};

/**
 * Prefetches the code-split JS bundle and initial queries for a designated application path.
 * Safe to call aggressively from hover, focus, and arrow key change listeners.
 * 
 * @param {string} rawPath - Destination route (e.g., '/inventory/items' or '/reports?report=day_book')
 */
export function prefetchRoute(rawPath) {
  if (!rawPath || typeof rawPath !== 'string') return;
  
  // Normalize path by stripping query strings and hashes
  const basePath = rawPath.split('?')[0].split('#')[0].trim().toLowerCase();
  if (!basePath || basePath === '#') return;

  // 1. Prefetch JavaScript component chunk
  if (!prefetchedChunks.has(basePath)) {
    const chunkLoader = CHUNK_LOADERS[basePath];
    if (chunkLoader) {
      prefetchedChunks.add(basePath);
      chunkLoader().catch(() => {
        // Silently catch network or idle import errors
        prefetchedChunks.delete(basePath);
      });
    } else if (basePath.startsWith('/settings')) {
      // Sub-route of settings: prefetch settings layout chunk
      if (!prefetchedChunks.has('/settings') && CHUNK_LOADERS['/settings']) {
        prefetchedChunks.add('/settings');
        CHUNK_LOADERS['/settings']().catch(() => {
          prefetchedChunks.delete('/settings');
        });
      }
    }
  }

  // 2. Prefetch foundational TanStack Query data if applicable
  const queryLoader = QUERY_PREFETCH_MAP[basePath];
  if (queryLoader) {
    try {
      const companyId = sajilo.getCompanyId();
      const queryKeyId = `${basePath}_${companyId}`;
      if (companyId && !prefetchedQueries.has(queryKeyId)) {
        prefetchedQueries.add(queryKeyId);
        queryLoader(companyId).catch(() => {
          prefetchedQueries.delete(queryKeyId);
        });
      }
    } catch {
      // Ignore context errors during prefetch
    }
  }
}
