import {
  BarChart2,
  TrendingUp,
  Users,
  CreditCard,
  Receipt,
  FileText,
  ShoppingCart,
  Warehouse,
  Settings2,
  History,
  Landmark,
  AlertTriangle,
  BookOpen,
  Activity,
  FileSpreadsheet
} from 'lucide-react';

/**
 * REPORT_CATEGORIES — Single Source of Truth for all reports in Sajilo ERP.
 * Any new report added here will automatically populate:
 * 1. The Reports directory catalogue on /reports
 * 2. The ReportSearch combobox with fuzzy matching and breadcrumbs
 * 3. Quick-navigation and permission indexes
 */
export const REPORT_CATEGORIES = [
  {
    id: 'accounting',
    label: 'Accounting',
    icon: BarChart2,
    color: 'purple',
    reports: [
      {
        id: 'trial_balance',
        label: 'Trial Balance',
        desc: 'All ledger accounts with debit and credit balances',
        keywords: ['trial balance', 'tb', 'ledger', 'debit', 'credit', 'general ledger'],
        permissionKey: 'reports.view',
        isRoute: false,
      },
      {
        id: 'profit_loss',
        label: 'Income Statement',
        desc: 'Revenue vs expenses for a given period (Profit & Loss)',
        keywords: ['income statement', 'profit and loss', 'p&l', 'revenue', 'expense', 'ebit', 'net income', 'operating profit'],
        permissionKey: 'reports.view',
        isRoute: false,
      },
      {
        id: 'balance_sheet',
        label: 'Balance Sheet',
        desc: 'Assets, liabilities, and equity as of a selected date',
        keywords: ['balance sheet', 'bs', 'assets', 'liabilities', 'equity', 'retained earnings'],
        permissionKey: 'reports.view',
        isRoute: false,
      },
      {
        id: 'day_book',
        label: 'Day Book',
        desc: 'All financial transactions for a selected date in dual-column format',
        keywords: ['day book', 'daily transactions', 'cash book', 'journal day'],
        permissionKey: 'reports.view',
        isRoute: true,
        path: '/reports/accounting/day-book',
      },
      {
        id: 'bank_reconciliation',
        label: 'Bank Reconciliation Report',
        desc: 'Reconcile ERP bank ledger with bank statements, tracking uncleared cheques, deposits, and variance',
        keywords: ['bank reconciliation', 'brs', 'cheque', 'uncleared deposit', 'transit', 'bank statement'],
        permissionKey: 'reports.view',
        isRoute: true,
        path: '/reports/accounting/bank-reconciliation',
      },
      {
        id: 'cash_flow',
        label: 'Cash Flow Summary',
        desc: 'Cash inflows and outflows (IAS 7 direct method)',
        keywords: ['cash flow', 'inflow', 'outflow', 'operating cash', 'liquidity'],
        permissionKey: 'reports.view',
        isRoute: false,
      },
      {
        id: 'ledger_detail',
        label: 'Detail General Ledger',
        desc: 'All transactions and running balance for a specific account',
        keywords: ['general ledger', 'gl', 'ledger detail', 'account statement', 'voucher transactions'],
        permissionKey: 'reports.view',
        isRoute: false,
      },
      {
        id: 'gl_summary',
        label: 'General Ledger Summary',
        desc: 'Summarized balances for all GL accounts',
        keywords: ['gl summary', 'account summary', 'trial balance summary'],
        permissionKey: 'reports.view',
        isRoute: false,
      },
      {
        id: 'journal_report',
        label: 'Journal Report',
        desc: 'All journal entries in the period with debit and credit breakdown',
        keywords: ['journal report', 'journal vouchers', 'general journal entries'],
        permissionKey: 'reports.view',
        isRoute: false,
      },
      {
        id: 'txn_list',
        label: 'Transaction List',
        desc: 'All financial transactions listed chronologically by date',
        keywords: ['transaction list', 'all transactions', 'voucher list'],
        permissionKey: 'reports.view',
        isRoute: false,
      },
    ]
  },
  {
    id: 'receivable',
    label: 'Receivable',
    icon: Users,
    color: 'blue',
    reports: [
      {
        id: 'ar_aging',
        label: 'Invoice Age (AR Aging)',
        desc: 'Outstanding customer invoices by overdue period',
        keywords: ['ar aging', 'invoice age', 'overdue invoices', 'receivable aging'],
        permissionKey: 'reports.view',
        isRoute: false,
      },
      {
        id: 'debtor_statement',
        label: 'Customer Statement',
        desc: 'Full transaction ledger history per customer',
        keywords: ['customer statement', 'party statement', 'debtor statement', 'client ledger'],
        permissionKey: 'reports.view',
        isRoute: false,
      },
      {
        id: 'ar_aging_summary',
        label: 'Customer Ageing Summary',
        desc: 'AR aging grouped by customer with 30, 60, 90+ day buckets',
        keywords: ['customer aging summary', 'ar summary', 'receivable summary aging'],
        permissionKey: 'reports.view',
        isRoute: false,
      },
      {
        id: 'customer_balance',
        label: 'Customer Receivable Summary',
        desc: 'Total receivables and balances per customer',
        keywords: ['customer balance', 'receivable summary', 'total due customers'],
        permissionKey: 'reports.view',
        isRoute: false,
      },
      {
        id: 'employee_receivable',
        label: 'Employee Receivable Balance',
        desc: 'Outstanding advances and receivables due from employees',
        keywords: ['employee receivable', 'employee advance', 'staff loan', 'salary advance'],
        permissionKey: 'reports.view',
        isRoute: true,
        path: '/reports/employee-receivables',
      },
      {
        id: 'customer_bill_due',
        label: 'Customer Bill Due',
        desc: 'Track and receive payments for outstanding customer invoices',
        keywords: ['customer bill due', 'unpaid sales invoices', 'receive payment', 'overdue bills'],
        permissionKey: 'reports.view',
        isRoute: true,
        path: '/reports/customer-bill-due',
      },
    ]
  },
  {
    id: 'payable',
    label: 'Payable',
    icon: CreditCard,
    color: 'amber',
    reports: [
      {
        id: 'ap_aging',
        label: 'Purchase Bill Age (AP Aging)',
        desc: 'Outstanding supplier bills categorized by overdue period',
        keywords: ['ap aging', 'bill age', 'supplier aging', 'payable aging'],
        permissionKey: 'reports.view',
        isRoute: false,
      },
      {
        id: 'vendor_statement',
        label: 'Supplier Statement',
        desc: 'Full transaction history and ledger per supplier',
        keywords: ['supplier statement', 'vendor statement', 'creditor ledger', 'vendor ledger'],
        permissionKey: 'reports.view',
        isRoute: false,
      },
      {
        id: 'ap_aging_summary',
        label: 'Supplier Ageing Summary',
        desc: 'AP aging grouped by supplier across aging buckets',
        keywords: ['supplier aging summary', 'ap summary', 'payable summary aging'],
        permissionKey: 'reports.view',
        isRoute: false,
      },
      {
        id: 'vendor_balance',
        label: 'Supplier Payable Summary',
        desc: 'Total payables and outstanding balances per supplier',
        keywords: ['supplier balance', 'vendor balance', 'payable summary'],
        permissionKey: 'reports.view',
        isRoute: false,
      },
      {
        id: 'employee_payable',
        label: 'Employee Payable Balance',
        desc: 'Unliquidated net wages and payroll owed to employees',
        keywords: ['employee payable', 'salary payable', 'wages payable', 'payroll due'],
        permissionKey: 'reports.view',
        isRoute: true,
        path: '/reports/employee-payables',
      },
      {
        id: 'supplier_bill_due',
        label: 'Supplier Bill Due',
        desc: 'Track and make payments for outstanding supplier invoices',
        keywords: ['supplier bill due', 'unpaid purchase bills', 'make payment', 'vendor dues'],
        permissionKey: 'reports.view',
        isRoute: true,
        path: '/reports/supplier-bill-due',
      },
    ]
  },
  {
    id: 'sales',
    label: 'Sales Report',
    icon: TrendingUp,
    color: 'indigo',
    reports: [
      {
        id: 'sales_summary',
        label: 'Sales Summary',
        desc: 'Total sales revenue by date range with tax and status',
        keywords: ['sales summary', 'total sales', 'revenue summary', 'sales register'],
        permissionKey: 'reports.view',
        isRoute: false,
      },
      {
        id: 'sales_by_customer',
        label: 'Sales By Customer',
        desc: 'Revenue breakdown and invoice counts per customer',
        keywords: ['sales by customer', 'top customers', 'client revenue'],
        permissionKey: 'reports.view',
        isRoute: false,
      },
      {
        id: 'sales_by_item',
        label: 'Sales By Item',
        desc: 'Which products and services are selling the most',
        keywords: ['sales by item', 'item sales', 'top selling products', 'product revenue'],
        permissionKey: 'reports.view',
        isRoute: false,
      },
      {
        id: 'sales_by_customer_monthly',
        label: 'Sales By Customer Monthly',
        desc: 'Monthly breakdown of sales per customer',
        keywords: ['sales by customer monthly', 'monthly customer trends'],
        permissionKey: 'reports.view',
        isRoute: false,
      },
      {
        id: 'sales_by_item_monthly',
        label: 'Sales By Item Monthly',
        desc: 'Monthly quantity and revenue breakdown per item',
        keywords: ['sales by item monthly', 'monthly item sales'],
        permissionKey: 'reports.view',
        isRoute: false,
      },
      {
        id: 'sales_return_report',
        label: 'Sales Master Report',
        desc: 'All sales invoices, returns, and POS in the period',
        keywords: ['sales master report', 'sales returns', 'invoices and pos'],
        permissionKey: 'reports.view',
        isRoute: false,
      },
    ]
  },
  {
    id: 'purchase',
    label: 'Purchase Report',
    icon: ShoppingCart,
    color: 'emerald',
    reports: [
      {
        id: 'purchase_summary',
        label: 'Purchase Summary',
        desc: 'Total purchases by date range with tax breakdown',
        keywords: ['purchase summary', 'total purchases', 'bills register', 'procurement summary'],
        permissionKey: 'reports.view',
        isRoute: false,
      },
      {
        id: 'purchase_by_vendor',
        label: 'Purchase By Supplier',
        desc: 'Spend breakdown and bill count per supplier',
        keywords: ['purchase by supplier', 'vendor spend', 'supplier procurement'],
        permissionKey: 'reports.view',
        isRoute: false,
      },
      {
        id: 'purchase_by_item',
        label: 'Purchase By Item',
        desc: 'Quantity and cost per item purchased',
        keywords: ['purchase by item', 'item costs', 'raw material purchases'],
        permissionKey: 'reports.view',
        isRoute: false,
      },
      {
        id: 'unpaid_bills',
        label: 'Unpaid Purchase Invoices',
        desc: 'All purchase bills with pending payment status',
        keywords: ['unpaid purchase bills', 'pending bills', 'bills to pay'],
        permissionKey: 'reports.view',
        isRoute: false,
      },
      {
        id: 'purchase_price_change_history',
        label: 'Purchase Price Change History',
        desc: 'Audit trail of purchase price changes across suppliers over time',
        keywords: ['purchase price history', 'cost price changes', 'supplier price revisions', 'procurement history'],
        permissionKey: 'reports.view',
        isRoute: true,
        path: '/reports/purchase-price-change-history',
      },
    ]
  },
  {
    id: 'tax',
    label: 'Tax Report',
    icon: Receipt,
    color: 'red',
    reports: [
      {
        id: 'vat_summary',
        label: 'VAT Summary Report',
        desc: 'VAT collected on sales and VAT paid on purchases',
        keywords: ['vat summary', 'value added tax', 'tax return', 'sales vat', 'purchase vat'],
        permissionKey: 'reports.view',
        isRoute: false,
      },
      {
        id: 'vat_sales',
        label: 'Sales VAT Register',
        desc: 'VAT-applicable sales with taxable amounts and tax breakdown',
        keywords: ['sales vat register', 'output vat', 'sales tax register'],
        permissionKey: 'reports.view',
        isRoute: false,
      },
      {
        id: 'vat_purchases',
        label: 'Purchase VAT Register',
        desc: 'VAT-applicable purchases with input tax breakdown',
        keywords: ['purchase vat register', 'input vat', 'purchase tax register'],
        permissionKey: 'reports.view',
        isRoute: false,
      },
      {
        id: 'tds_report',
        label: 'TDS Deduction Report',
        desc: 'Tax Deducted at Source from payroll and vendor payments',
        keywords: ['tds report', 'tax deducted at source', 'withholding tax', 'payroll tds'],
        permissionKey: 'reports.view',
        isRoute: false,
      },
    ]
  },
  {
    id: 'inventory',
    label: 'Inventory Report',
    icon: Warehouse,
    color: 'teal',
    reports: [
      {
        id: 'stock_summary',
        label: 'Stock Summary',
        desc: 'Current stock levels, WAC unit cost, and total inventory value',
        keywords: ['stock summary', 'inventory on hand', 'current stock', 'warehouse stock'],
        permissionKey: 'reports.view',
        isRoute: false,
      },
      {
        id: 'stock_ledger_statement',
        label: 'Stock Ledger Statement',
        desc: 'Detailed stock statement for a specific item with qty in, out, and running balance',
        keywords: ['stock ledger', 'item card', 'inventory ledger', 'bin card'],
        permissionKey: 'reports.view',
        isRoute: false,
      },
      {
        id: 'stock_by_location',
        label: 'Stock by Location',
        desc: 'Current stock levels broken down by Godown or warehouse location',
        keywords: ['stock by location', 'godown stock', 'warehouse inventory', 'multi location stock'],
        permissionKey: 'reports.view',
        isRoute: false,
      },
      {
        id: 'low_stock',
        label: 'Low Stock / Reorder',
        desc: 'Items below reorder level and shortage calculations',
        keywords: ['low stock', 'reorder level', 'shortage', 'stock alert'],
        permissionKey: 'reports.view',
        isRoute: false,
      },
      {
        id: 'stock_movement',
        label: 'Stock Movement',
        desc: 'All stock ins, outs, adjustments, and transfers in the period',
        keywords: ['stock movement', 'stock ins and outs', 'inventory flow'],
        permissionKey: 'reports.view',
        isRoute: false,
      },
      {
        id: 'item_valuation',
        label: 'Item Valuation',
        desc: 'Inventory valuation at weighted average cost (WAC)',
        keywords: ['item valuation', 'inventory valuation', 'wac valuation'],
        permissionKey: 'reports.view',
        isRoute: false,
      },
      {
        id: 'category_summary',
        label: 'Category-wise Summary',
        desc: 'Stock quantities and valuation grouped by item category',
        keywords: ['category summary', 'category stock', 'category valuation'],
        permissionKey: 'reports.view',
        isRoute: false,
      },
      {
        id: 'price_revision_history',
        label: 'Sales Price Revision History',
        desc: 'Immutable audit trail of sales price changes over time',
        keywords: ['sales price revision', 'price change log', 'selling price history'],
        permissionKey: 'reports.view',
        isRoute: true,
        path: '/reports/price-revision-history',
      },
      {
        id: 'inventory_turnover',
        label: 'Inventory Turnover Ratio',
        desc: 'Turnover ratio, Cost of Goods Sold (COGS), and Days on Shelf (DSI)',
        keywords: ['inventory turnover', 'turnover ratio', 'dsi', 'days on shelf', 'dead stock', 'slow moving'],
        permissionKey: 'reports.view',
        isRoute: true,
        path: '/reports/inventory-turnover',
      },
      {
        id: 'gross_profit_margin',
        label: 'Gross Profit Margin Report',
        desc: 'Revenue, COGS, and Gross Margin percentage analyzed per item',
        keywords: ['gross profit margin', 'gpm', 'margin per item', 'item profitability'],
        permissionKey: 'reports.view',
        isRoute: true,
        path: '/reports/inventory/gross-profit-margin',
      },
      {
        id: 'negative_stock',
        label: 'Negative Stock Exceptions',
        desc: 'Items currently below zero quantity with godown location',
        keywords: ['negative stock', 'stock exception', 'deficit stock', 'below zero'],
        permissionKey: 'reports.view',
        isRoute: true,
        path: '/reports/inventory/negative-stock-exceptions',
      },
    ]
  },
  {
    id: 'system',
    label: 'System Report',
    icon: Settings2,
    color: 'slate',
    reports: [
      {
        id: 'communication_logs',
        label: 'Communication Logs',
        desc: 'Audit trail of Email and WhatsApp background deliveries and statuses',
        keywords: ['communication logs', 'email logs', 'delivery audit', 'whatsapp logs', 'smtp logs'],
        permissionKey: 'reports.view',
        isRoute: true,
        path: '/reports/communication-logs',
      }
    ]
  },
  {
    id: 'activity_log',
    label: 'Activity Log',
    icon: History,
    color: 'slate',
    reports: [],
    isCustom: true,
  },
];

/**
 * Flattens all reports into a search index with breadcrumbs and keyword arrays.
 * Automatically called by ReportSearch.
 */
export const getFlattenedReportIndex = () => {
  const index = [];

  REPORT_CATEGORIES.forEach(category => {
    (category.reports || []).forEach(rep => {
      index.push({
        ...rep,
        categoryId: category.id,
        categoryLabel: category.label,
        categoryColor: category.color,
        categoryIcon: category.icon,
        breadcrumb: `${category.label} > ${rep.label}`,
        // Target navigation path: if isRoute use rep.path, otherwise deep link to /reports?report=id
        navPath: rep.isRoute ? rep.path : `/reports?report=${rep.id}`
      });
    });

    if (category.isCustom && category.id === 'activity_log') {
      index.push({
        id: 'activity_log',
        label: 'User Activity Log',
        desc: 'Comprehensive audit trail of opening balances, imports, deletions, and voucher actions',
        keywords: ['activity log', 'audit trail', 'user actions', 'deletions', 'voucher audit'],
        permissionKey: 'reports.view',
        isRoute: false,
        categoryId: 'activity_log',
        categoryLabel: 'Activity Log',
        categoryColor: 'slate',
        categoryIcon: History,
        breadcrumb: `Activity Log > User Activity Log`,
        navPath: `/reports?category=activity_log`
      });
    }
  });

  return index;
};
