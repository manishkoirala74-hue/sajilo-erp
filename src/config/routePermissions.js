/**
 * Central Route Permission Registry
 * Maps application paths to required permissions.
 * Path matching normalizes trailing slashes, query parameters, and dynamic segments.
 */

export const ROUTE_PERMISSIONS = [
  // Core Landing Pages
  { path: '/', permission: null, access: 'authenticated' },
  { path: '/onboarding', permission: null, access: 'authenticated' },
  { path: '/profile', permission: null, access: 'authenticated' },
  { path: '/help-support', permission: null, access: 'authenticated' },

  // Sales & POS Module
  { path: '/partners/customers', permission: 'partners.view', access: 'permission' },
  { path: '/pos', permission: 'pos.view', access: 'permission' },
  { path: '/sales/quotations', permission: 'sales_orders.view', access: 'permission' },
  { path: '/sales/orders', permission: 'sales_orders.view', access: 'permission' },
  { path: '/sales/invoices', permission: 'sales_invoices.view', access: 'permission' },
  { path: '/sales/returns', permission: 'sales_returns.view', access: 'permission' },

  // Purchases Module
  { path: '/partners/suppliers', permission: 'partners.view', access: 'permission' },
  { path: '/purchase/orders', permission: 'purchase_orders.view', access: 'permission' },
  { path: '/purchase/invoices', permission: 'purchase_invoices.view', access: 'permission' },
  { path: '/purchase/returns', permission: 'purchase_returns.view', access: 'permission' },

  // Inventory & Operations Module
  { path: '/inventory/items', permission: 'items.view', access: 'permission' },
  { path: '/inventory/godowns', permission: 'items.view', access: 'permission' },
  { path: '/inventory/transfers', permission: 'stock_adjustments.view', access: 'permission' },
  { path: '/inventory/categories', permission: 'categories.view', access: 'permission' },
  { path: '/inventory/uom', permission: 'uom.view', access: 'permission' },
  { path: '/inventory/adjustments', permission: 'stock_adjustments.view', access: 'permission' },
  { path: '/inventory/discounts', permission: 'discounts.view', access: 'permission' },
  { path: '/inventory/assembly', permission: 'stock_adjustments.view', access: 'permission' },
  { path: '/inventory/price-revision', permission: 'items.view', access: 'permission' },
  { path: '/manufacturing/orders', permission: 'manufacturing.view', access: 'permission' },
  { path: '/services/contracts', permission: 'services.view', access: 'permission' },

  // Finance & Accounting Module
  { path: '/accounting/chart-of-accounts', permission: 'chart_of_accounts.view', access: 'permission' },
  { path: '/accounting/general-ledger', permission: 'chart_of_accounts.view', access: 'permission' },
  { path: '/treasury/vouchers', permission: 'vouchers.view', access: 'permission' },
  { path: '/treasury/bank-accounts', permission: 'vouchers.view', access: 'permission' },
  { path: '/assets/register', permission: 'depreciation.view', access: 'permission' },
  { path: '/assets/depreciation', permission: 'depreciation.view', access: 'permission' },
  { path: '/assets/compliance', permission: 'depreciation.view', access: 'permission' },

  // HR & Payroll Module
  { path: '/hr/employees', permission: 'payroll_mapping.view', access: 'permission' },
  { path: '/hr/payroll', permission: 'payroll_mapping.view', access: 'permission' },

  // Construction Module
  { path: '/construction/projects', permission: 'items.view', access: 'permission' },
  { path: '/construction/delivery-challans', permission: 'sales_invoices.view', access: 'permission' },
  { path: '/construction/consolidated-billing', permission: 'sales_invoices.view', access: 'permission' },

  // Reports Module
  { path: '/reports', permission: 'reports.view', access: 'permission' },

  // Settings Sub-routes (Most-specific paths defined first; longest-prefix algorithm evaluates longest paths first)
  { path: '/settings/company/roles', permission: 'companies.manage_users', access: 'permission' },
  { path: '/settings/company/approvals', permission: 'approvals.manage', access: 'permission' },
  { path: '/settings/company/management', permission: 'companies.view', access: 'permission' },
  { path: '/settings/company/password', permission: 'settings.view', access: 'permission' },

  { path: '/settings/finance/fiscal-year', permission: 'fiscal_year.view', access: 'permission' },
  { path: '/settings/finance/tax-vat', permission: 'tax.view', access: 'permission' },
  { path: '/settings/finance/gl-mapping', permission: 'gl_mapping.view', access: 'permission' },
  { path: '/settings/finance/payroll-mapping', permission: 'payroll_mapping.view', access: 'permission' },
  { path: '/settings/finance/depreciation', permission: 'depreciation.view', access: 'permission' },

  { path: '/settings/operations/collections', permission: 'settings.view', access: 'permission' },
  { path: '/settings/operations/vouchers', permission: 'voucher_sequence.view', access: 'permission' },
  { path: '/settings/operations/inventory', permission: 'settings.view', access: 'permission' },
  { path: '/settings/operations/templates', permission: 'document_templates.view', access: 'permission' },
  { path: '/settings/operations/quick-actions', permission: 'settings.view', access: 'permission' },

  { path: '/settings/data/cut-over', permission: 'cutover.view', access: 'permission' },
  { path: '/settings/data/import', permission: 'settings.view', access: 'permission' },
  { path: '/settings/data/utilities', permission: 'settings.view', access: 'permission' },

  { path: '/settings/integrations/features', permission: 'settings.view', access: 'permission' },
  { path: '/settings/integrations/regional', permission: 'settings.view', access: 'permission' },
  { path: '/settings/integrations/storage', permission: 'settings.view', access: 'permission' },
  { path: '/settings/integrations/communication', permission: 'settings.view', access: 'permission' },
  { path: '/settings/integrations/payment', permission: 'settings.view', access: 'permission' },

  { path: '/settings/templates/builder', permission: 'document_templates.view', access: 'permission' },

  { path: '/settings', permission: 'settings.view', access: 'permission', exact: true },
  { path: '/settings/company', permission: 'settings.view', access: 'permission' },
  { path: '/settings/finance', permission: 'settings.view', access: 'permission' },
  { path: '/settings/operations', permission: 'settings.view', access: 'permission' },
  { path: '/settings/data', permission: 'settings.view', access: 'permission' },
  { path: '/settings/integrations', permission: 'settings.view', access: 'permission' }
];

/**
 * Normalizes a URL path by removing trailing slashes and query strings.
 */
export function normalizePath(pathname) {
  if (!pathname) return '/';
  const cleanPath = pathname.split('?')[0].split('#')[0];
  if (cleanPath.length > 1 && cleanPath.endsWith('/')) {
    return cleanPath.slice(0, -1);
  }
  return cleanPath;
}

/**
 * Resolves the required permission for a given path using longest-prefix matching.
 */
export function getRoutePermissionConfig(pathname) {
  const normalized = normalizePath(pathname);

  // 1. Exact match first
  const exactMatch = ROUTE_PERMISSIONS.find(r => r.path === normalized);
  if (exactMatch) return exactMatch;

  // 2. Sort non-exact routes by path length descending (longest prefix wins)
  const sortedPrefixRoutes = [...ROUTE_PERMISSIONS]
    .filter(r => !r.exact && r.path !== '/')
    .sort((a, b) => b.path.length - a.path.length);

  const prefixMatch = sortedPrefixRoutes.find(r => 
    normalized.startsWith(r.path + '/') || normalized === r.path
  );

  if (prefixMatch) return prefixMatch;

  // TODO: Switch to Fail-Closed for production deployment
  // In production, flip to: return { path: normalized, permission: 'system.unregistered', access: 'permission' };
  return { path: normalized, permission: null, access: 'authenticated' };
}
