import * as Icons from 'lucide-react';
import { buildNavGroups } from '@/components/layout/Sidebar';
import { getFlattenedReportIndex } from '@/config/reportsRegistry';
import { getFlattenedSettingsIndex } from '@/pages/settings/config/settingsNavConfig';
import { canAccessRoute, hasPermission } from '@/lib/permissionResolver';

/**
 * QUICK_CREATE_ACTIONS — Global Quick-Create actions
 * Indexed for Ctrl+K search and bound to Level 3 Global Shortcuts (Alt + Key).
 */
export const QUICK_CREATE_ACTIONS = [
  {
    id: 'qc.journal_entry',
    label: 'New Journal Entry',
    category: 'QUICK_CREATE',
    type: 'MODAL',
    target: 'JOURNAL_ENTRY_MODAL',
    icon: Icons.BookOpen,
    keywords: ['new journal', 'create journal', 'add voucher', 'entry', 'manual gl', 'quick create'],
    breadcrumb: 'Accounting > Journal Entry > New',
    permissionKey: 'accounting.create',
    shortcut: 'Alt+J',
    shortcutKey: { key: 'j', alt: true }
  },
  {
    id: 'qc.sales_invoice',
    label: 'New Sales Invoice',
    category: 'QUICK_CREATE',
    type: 'ROUTE',
    target: '/sales/invoices?action=new',
    icon: Icons.TrendingUp,
    keywords: ['new sales invoice', 'create invoice', 'bill customer', 'pos sales', 'quick create'],
    breadcrumb: 'Sales > Invoices > New',
    permissionKey: 'sales.create',
    shortcut: 'Alt+I',
    shortcutKey: { key: 'i', alt: true }
  },
  {
    id: 'qc.purchase_bill',
    label: 'New Purchase Bill',
    category: 'QUICK_CREATE',
    type: 'ROUTE',
    target: '/purchase/invoices?action=new',
    icon: Icons.Receipt,
    keywords: ['new purchase bill', 'vendor invoice', 'supplier bill', 'quick create'],
    breadcrumb: 'Purchases > Invoices > New',
    permissionKey: 'purchase.create',
    shortcut: 'Alt+P',
    shortcutKey: { key: 'p', alt: true }
  },
  {
    id: 'qc.customer',
    label: 'New Customer',
    category: 'QUICK_CREATE',
    type: 'ROUTE',
    target: '/partners/customers?action=new',
    icon: Icons.UserCheck,
    keywords: ['new customer', 'create partner', 'add client', 'quick create'],
    breadcrumb: 'Partners > Customers > New',
    permissionKey: 'partners.create',
    shortcut: 'Alt+C',
    shortcutKey: { key: 'c', alt: true }
  },
  {
    id: 'qc.item',
    label: 'New Inventory Item',
    category: 'QUICK_CREATE',
    type: 'ROUTE',
    target: '/inventory/items?action=new',
    icon: Icons.Boxes,
    keywords: ['new item', 'create product', 'add stock item', 'inventory sku', 'quick create'],
    breadcrumb: 'Inventory > Items > New',
    permissionKey: 'inventory.create',
    shortcut: 'Alt+M',
    shortcutKey: { key: 'm', alt: true }
  }
];

/**
 * Resolves all actionable entries across the system into a unified collection.
 * 
 * @param {Object} ctx - Auth and settings context { user, activeRole, activeCompany, serverSettings }
 * @returns {Array} List of typed actions
 */
export function getAllActions(ctx = {}) {
  const { user, activeRole, activeCompany, serverSettings } = ctx;

  // 1. Operational Routes (Sidebar)
  const operationalNav = buildNavGroups(serverSettings)
    .flatMap(group => group.items.flatMap(item => item.isSubGroup ? item.items : [item]))
    .filter(item => canAccessRoute(item.path, user, activeRole, null, activeCompany))
    .map(item => ({
      ...item,
      id: `NAV_${item.path}`,
      type: 'ROUTE',
      target: item.path,
      iconComponent: item.icon,
      keywords: [item.label.toLowerCase(), ...(item.keywords || [])],
      category: 'NAVIGATION'
    }));

  // 2. Report Routes
  const reportNav = getFlattenedReportIndex()
    .filter(report => !report.permissionKey || hasPermission({ user, activeCompany, activeRole, permissionKey: report.permissionKey }))
    .map(item => ({
      ...item,
      id: `REP_${item.id || item.navPath}`,
      type: 'ROUTE',
      target: item.navPath || item.path,
      iconComponent: item.categoryIcon || Icons.BarChart2,
      keywords: [item.label.toLowerCase(), ...(item.keywords || []), item.desc?.toLowerCase()].filter(Boolean),
      category: 'REPORTS'
    }));

  // 3. Settings Routes
  const settingsNav = getFlattenedSettingsIndex()
    .filter(s => !s.permissionKey || hasPermission({ user, activeCompany, activeRole, permissionKey: s.permissionKey }))
    .map(item => ({
      ...item,
      id: `SET_${item.path}`,
      type: 'ROUTE',
      target: item.path,
      iconComponent: Icons.Settings,
      keywords: [item.label.toLowerCase(), ...(item.keywords || [])],
      category: 'SETTINGS'
    }));

  // 4. Quick-Create Actions
  const quickCreate = QUICK_CREATE_ACTIONS
    .filter(a => !a.permissionKey || hasPermission({ user, activeCompany, activeRole, permissionKey: a.permissionKey }))
    .map(item => ({
      ...item,
      iconComponent: item.icon
    }));

  return {
    operationalNav,
    reportNav,
    settingsNav,
    quickCreate,
    all: [...quickCreate, ...operationalNav, ...reportNav, ...settingsNav]
  };
}
