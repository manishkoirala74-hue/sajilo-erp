import { Building, Landmark, Settings2, Database, Plug } from 'lucide-react';

export const SETTINGS_CATEGORIES = [
  { id: 'company', label: 'Company Workspace', icon: Building, path: '/settings/company' },
  { id: 'finance', label: 'Finance & Tax Control', icon: Landmark, path: '/settings/finance' },
  { id: 'operations', label: 'Operational Features', icon: Settings2, path: '/settings/operations' },
  { id: 'data', label: 'Data Logistics', icon: Database, path: '/settings/data' },
  { id: 'integrations', label: 'App & Integrations', icon: Plug, path: '/settings/integrations' },
];

export const SETTINGS_SUB_CATEGORIES = {
  company: [
    { id: 'management', label: 'Company Profile', path: '/settings/company/management', permissionKey: 'companies.view', keywords: ['name', 'logo', 'address', 'phone', 'contact'] },
    { id: 'roles', label: 'User & Access Roles', path: '/settings/company/roles', permissionKey: 'companies.manage_users', keywords: ['permissions', 'rbac', 'users', 'access', 'admin'] },
    { id: 'password', label: 'Password Policy', path: '/settings/company/password', permissionKey: 'settings.view', keywords: ['security', 'login', 'authentication', 'complexity'] },
    { id: 'approvals', label: 'Approval Controls', path: '/settings/company/approvals', permissionKey: 'approvals.manage', keywords: ['workflow', 'review', 'limits'] },
    { id: 'security', label: 'Security Policy', path: '/settings/company/security', permissionKey: 'settings.view', keywords: ['ip', 'whitelist', 'timeout', 'audit', 'session'] },
    { id: 'approval-queue', label: 'Approval Queue', path: '/settings/company/approval-queue', permissionKey: 'settings.view', keywords: ['pending', 'approve', 'reject', 'queue'] },
  ],
  finance: [
    { id: 'fiscal-year', label: 'Fiscal Year Management', path: '/settings/finance/fiscal-year', permissionKey: 'fiscal_year.view', keywords: ['dates', 'calendar', 'start', 'end'] },
    { id: 'tax-vat', label: 'Tax & VAT Matrices', path: '/settings/finance/tax-vat', permissionKey: 'tax.view', keywords: ['gst', 'percentage', 'rate'] },
    { id: 'gl-mapping', label: 'GL Account Mapping', path: '/settings/finance/gl-mapping', permissionKey: 'gl_mapping.view', keywords: ['ledger', 'accounting', 'chart'] },
    { id: 'payroll-mapping', label: 'Payroll Component Mapping', path: '/settings/finance/payroll-mapping', permissionKey: 'payroll_mapping.view', keywords: ['salary', 'wages', 'hr'] },
    { id: 'depreciation', label: 'Depreciation Method', path: '/settings/finance/depreciation', permissionKey: 'depreciation.view', keywords: ['assets', 'straight-line', 'declining'] },
    { id: 'period-lock', label: 'Period Lock', path: '/settings/finance/period-lock', permissionKey: 'settings.view', keywords: ['close', 'lock', 'date', 'book closing'] },
    { id: 'costing-method', label: 'Accounting Controls', path: '/settings/finance/costing-method', permissionKey: 'settings.view', keywords: ['fifo', 'lifo', 'wac', 'currency', 'tax'] },
  ],
  operations: [
    { id: 'collections', label: 'Receivable Collections', path: '/settings/operations/collections', permissionKey: 'settings.view', keywords: ['invoices', 'payment', 'due', 'reminders'] },
    { id: 'vouchers', label: 'Voucher Numbering', path: '/settings/operations/vouchers', permissionKey: 'voucher_sequence.view', keywords: ['sequence', 'prefix', 'invoice number'] },
    { id: 'inventory', label: 'Inventory Policy', path: '/settings/operations/inventory', permissionKey: 'settings.view', keywords: ['stock', 'negative', 'policy'] },
    { id: 'templates', label: 'PDF Document Templates', path: '/settings/operations/templates', permissionKey: 'document_templates.view', keywords: ['print', 'design', 'layout', 'receipt'] },
    { id: 'quick-actions', label: 'Quick Actions Menu', path: '/settings/operations/quick-actions', permissionKey: 'settings.view', keywords: ['menu', 'command palette', 'shortcuts'] },
    { id: 'batch-expiry', label: 'Inventory Constraints', path: '/settings/operations/batch-expiry', permissionKey: 'settings.view', keywords: ['batch', 'expiry', 'over receive', 'tolerance'] },
  ],
  data: [
    { id: 'cut-over', label: 'System Cut-Over', path: '/settings/data/cut-over', permissionKey: 'cutover.view', keywords: ['migration', 'opening balances', 'transition'] },
    { id: 'import', label: 'Item Import Export', path: '/settings/data/import', permissionKey: 'settings.view', keywords: ['csv', 'excel', 'bulk'] },
    { id: 'utilities', label: 'Data Utilities', path: '/settings/data/utilities', permissionKey: 'settings.view', keywords: ['cleanup', 'recalculate', 'timeline', 'wac'] },
  ],
  integrations: [
    { id: 'features', label: 'Feature Toggles', path: '/settings/integrations/features', permissionKey: 'settings.view', keywords: ['modules', 'enable', 'disable', 'godown', 'manufacturing'] },
    { id: 'regional', label: 'Regional Settings', path: '/settings/integrations/regional', permissionKey: 'settings.view', keywords: ['timezone', 'currency', 'locale', 'date format'] },
    { id: 'storage', label: 'Storage & Media Limits', path: '/settings/integrations/storage', permissionKey: 'settings.view', keywords: ['space', 'attachments', 'images'] },
    { id: 'payment', label: 'Payment Gateways', path: '/settings/integrations/payment', permissionKey: 'settings.view', keywords: ['stripe', 'paypal', 'esewa', 'khalti'] },
    { id: 'communication', label: 'Communication Channels', path: '/settings/integrations/communication', permissionKey: 'settings.view', keywords: ['email', 'sms', 'smtp', 'notifications'] },
  ],
};

// Flatten all items for search index
export const getFlattenedSettingsIndex = () => {
  const index = [];
  
  SETTINGS_CATEGORIES.forEach(category => {
    const subItems = SETTINGS_SUB_CATEGORIES[category.id] || [];
    subItems.forEach(sub => {
      index.push({
        ...sub,
        categoryLabel: category.label,
        breadcrumb: `${category.label} > ${sub.label}`,
      });
    });
  });
  
  return index;
};
