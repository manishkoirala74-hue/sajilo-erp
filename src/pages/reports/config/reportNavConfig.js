export const getFlattenedReportIndex = () => [
  { label: 'Day Book Report', path: '/reports/accounting/day-book', permissionKey: 'reports.view', icon: 'BookOpen' },
  { label: 'Customer Bill Due', path: '/reports/customer-bill-due', permissionKey: 'reports.view', icon: 'AlertTriangle' },
  { label: 'Supplier Bill Due', path: '/reports/supplier-bill-due', permissionKey: 'reports.view', icon: 'AlertTriangle' },
  { label: 'Employee Payable Report', path: '/reports/employee-payables', permissionKey: 'reports.view', icon: 'Users' },
  { label: 'Employee Receivable Report', path: '/reports/employee-receivables', permissionKey: 'reports.view', icon: 'Users' },
  { label: 'Gross Profit Margin', path: '/reports/inventory/gross-profit-margin', permissionKey: 'reports.view', icon: 'TrendingUp' },
  { label: 'Inventory Turnover', path: '/reports/inventory-turnover', permissionKey: 'reports.view', icon: 'TrendingUp' },
  { label: 'Negative Stock Exceptions', path: '/reports/inventory/negative-stock-exceptions', permissionKey: 'reports.view', icon: 'AlertTriangle' },
  { label: 'Price Revision History', path: '/reports/price-revision-history', permissionKey: 'reports.view', icon: 'History' },
  { label: 'Purchase Price Change History', path: '/reports/purchase-price-change-history', permissionKey: 'reports.view', icon: 'History' },
  { label: 'Communication Logs', path: '/reports/communication-logs', permissionKey: 'reports.view', icon: 'Activity' },
  { label: 'User Activity Log', path: '/reports/user-activity-log', permissionKey: 'reports.view', icon: 'Activity' },
];
