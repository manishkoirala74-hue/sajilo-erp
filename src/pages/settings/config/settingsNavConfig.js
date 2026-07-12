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
    { id: 'management', label: 'Company Profile', path: '/settings/company/management', keywords: ['name', 'logo', 'address', 'phone', 'contact'] },
    { id: 'roles', label: 'User & Access Roles', path: '/settings/company/roles', keywords: ['permissions', 'rbac', 'users', 'access', 'admin'] },
    { id: 'password', label: 'Password Policy', path: '/settings/company/password', keywords: ['security', 'login', 'authentication', 'complexity'] },
    { id: 'approvals', label: 'Approval Controls', path: '/settings/company/approvals', keywords: ['workflow', 'review', 'limits'] },
  ],
  finance: [
    { id: 'fiscal-year', label: 'Fiscal Year Management', path: '/settings/finance/fiscal-year', keywords: ['dates', 'calendar', 'start', 'end'] },
    { id: 'tax-vat', label: 'Tax & VAT Matrices', path: '/settings/finance/tax-vat', keywords: ['gst', 'percentage', 'rate'] },
    { id: 'gl-mapping', label: 'GL Account Mapping', path: '/settings/finance/gl-mapping', keywords: ['ledger', 'accounting', 'chart'] },
    { id: 'payroll-mapping', label: 'Payroll Component Mapping', path: '/settings/finance/payroll-mapping', keywords: ['salary', 'wages', 'hr'] },
    { id: 'depreciation', label: 'Depreciation Method', path: '/settings/finance/depreciation', keywords: ['assets', 'straight-line', 'declining'] },
  ],
  operations: [
    { id: 'collections', label: 'Receivable Collections', path: '/settings/operations/collections', keywords: ['invoices', 'payment', 'due', 'reminders'] },
    { id: 'vouchers', label: 'Voucher Numbering', path: '/settings/operations/vouchers', keywords: ['sequence', 'prefix', 'invoice number'] },
    { id: 'inventory', label: 'Inventory Policy', path: '/settings/operations/inventory', keywords: ['stock', 'negative', 'policy'] },
    { id: 'templates', label: 'PDF Document Templates', path: '/settings/operations/templates', keywords: ['print', 'design', 'layout', 'receipt'] },
    { id: 'quick-actions', label: 'Quick Actions Menu', path: '/settings/operations/quick-actions', keywords: ['menu', 'command palette', 'shortcuts'] },
  ],
  data: [
    { id: 'cut-over', label: 'System Cut-Over', path: '/settings/data/cut-over', keywords: ['migration', 'opening balances', 'transition'] },
    { id: 'import', label: 'Item Import Export', path: '/settings/data/import', keywords: ['csv', 'excel', 'bulk'] },
    { id: 'utilities', label: 'Data Utilities', path: '/settings/data/utilities', keywords: ['cleanup', 'recalculate', 'timeline', 'wac'] },
  ],
  integrations: [
    { id: 'features', label: 'Feature Toggles', path: '/settings/integrations/features', keywords: ['modules', 'enable', 'disable', 'godown', 'manufacturing'] },
    { id: 'regional', label: 'Regional Settings', path: '/settings/integrations/regional', keywords: ['timezone', 'currency', 'locale', 'date format'] },
    { id: 'storage', label: 'Storage & Media Limits', path: '/settings/integrations/storage', keywords: ['space', 'attachments', 'images'] },
    { id: 'payment', label: 'Payment Gateways', path: '/settings/integrations/payment', keywords: ['stripe', 'paypal', 'esewa', 'khalti'] },
    { id: 'communication', label: 'Communication Channels', path: '/settings/integrations/communication', keywords: ['email', 'sms', 'smtp', 'notifications'] },
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
