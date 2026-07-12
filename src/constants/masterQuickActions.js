export const MASTER_QUICK_ACTIONS = [
  // Creation Forms (Modals)
  { id: 'CREATE_CUST', type: 'MODAL', target: 'CREATE_CUSTOMER', label: 'New Customer', icon: 'UserPlus', category: 'Creation Forms', keywords: ['add', 'client', 'buyer'] },
  { id: 'CREATE_SUPP', type: 'MODAL', target: 'CREATE_SUPPLIER', label: 'New Supplier', icon: 'Truck', category: 'Creation Forms', keywords: ['add', 'vendor', 'seller'] },
  { id: 'CREATE_ITEM', type: 'MODAL', target: 'CREATE_ITEM', label: 'New Item', icon: 'PackagePlus', category: 'Creation Forms', keywords: ['add', 'product', 'goods', 'material'] },

  // Creation Forms (Routes)
  { id: 'CREATE_SI', type: 'ROUTE', target: '/sales/invoices?new=1', label: 'New Sales Invoice', icon: 'Receipt', category: 'Creation Forms', keywords: ['add', 'bill', 'sales', 'receipt'] },
  { id: 'CREATE_PI', type: 'ROUTE', target: '/purchase/invoices?new=1', label: 'New Purchase Invoice', icon: 'Receipt', category: 'Creation Forms', keywords: ['add', 'bill', 'purchase', 'expense'] },
  { id: 'CREATE_CBV', type: 'ROUTE', target: '/treasury/vouchers/new', label: 'New Cash/Bank Voucher', icon: 'Banknote', category: 'Creation Forms', keywords: ['add', 'payment', 'receipt', 'voucher', 'cash', 'bank'] },
  { id: 'CREATE_JE', type: 'ROUTE', target: '/treasury/vouchers?new=1&type=Journal', label: 'New Journal Entry', icon: 'FileText', category: 'Creation Forms', keywords: ['add', 'jv', 'journal', 'entry', 'adjustment'] },
  { id: 'CREATE_SA', type: 'ROUTE', target: '/inventory/adjustments/new', label: 'New Stock Adjustment', icon: 'SlidersHorizontal', category: 'Creation Forms', keywords: ['add', 'stock', 'inventory', 'adjustment', 'reconciliation'] },

  // Financial Reports (Routes)
  { id: 'REP_GL', type: 'ROUTE', target: '/reports?report=ledger_detail', label: 'Detail General Ledger', icon: 'BookOpen', category: 'Financial Reports', keywords: ['gl', 'ledger', 'statement', 'books', 'account history'] },
  { id: 'REP_TB', type: 'ROUTE', target: '/reports?report=trial_balance', label: 'Trial Balance', icon: 'Scale', category: 'Financial Reports', keywords: ['tb', 'trial', 'balance'] },
  { id: 'REP_CF', type: 'ROUTE', target: '/reports?report=cash_flow', label: 'Cash Flow', icon: 'DollarSign', category: 'Financial Reports', keywords: ['cf', 'cash', 'flow'] },
  
  // Inventory Reports (Routes)
  { id: 'REP_IT', type: 'ROUTE', target: '/reports/inventory-turnover', label: 'Inventory Turnover', icon: 'BarChart2', category: 'Inventory Reports', keywords: ['turnover', 'stock', 'movement'] },
  { id: 'REP_GPM', type: 'ROUTE', target: '/reports/inventory/gross-profit-margin', label: 'Gross Profit Margin', icon: 'TrendingUp', category: 'Inventory Reports', keywords: ['gpm', 'gross', 'profit', 'margin'] },
  { id: 'REP_NSE', type: 'ROUTE', target: '/reports/inventory/negative-stock-exceptions', label: 'Negative Stock Exceptions', icon: 'AlertTriangle', category: 'Inventory Reports', keywords: ['negative', 'stock', 'exception', 'error'] },

  // Payables & Receivables (Routes)
  { id: 'REP_CBD', type: 'ROUTE', target: '/reports/customer-bill-due', label: 'Customer Bill Due', icon: 'FileWarning', category: 'Payables & Receivables', keywords: ['cbd', 'customer', 'bill', 'due', 'receivable', 'aging'] },
  { id: 'REP_SBD', type: 'ROUTE', target: '/reports/supplier-bill-due', label: 'Supplier Bill Due', icon: 'FileWarning', category: 'Payables & Receivables', keywords: ['sbd', 'supplier', 'bill', 'due', 'payable', 'aging'] },
];
