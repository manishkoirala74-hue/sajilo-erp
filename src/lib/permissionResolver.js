/**
 * Pure Functional Permission Resolver
 * Evaluates whether a user has permission in the context of the active company.
 */

import { getRoutePermissionConfig, normalizePath } from '@/config/routePermissions';

/**
 * Maps granular permission key (e.g. 'tax.manage') to legacy menu_permissions module and action level.
 */
const LEGACY_MODULE_MAP = {
  // Domain Modules
  'sales_orders.view': { module: 'sales_orders', level: 'view' },
  'sales_orders.edit': { module: 'sales_orders', level: 'edit' },
  'sales_orders.approve': { module: 'sales_orders', level: 'full' },

  'sales_invoices.view': { module: 'sales_invoices', level: 'view' },
  'sales_invoices.edit': { module: 'sales_invoices', level: 'edit' },
  'sales_invoices.approve': { module: 'sales_invoices', level: 'full' },

  'sales_returns.view': { module: 'sales_returns', level: 'view' },
  'sales_returns.edit': { module: 'sales_returns', level: 'edit' },
  'sales_returns.approve': { module: 'sales_returns', level: 'full' },

  'pos.view': { module: 'pos', level: 'view' },
  'pos.edit': { module: 'pos', level: 'edit' },

  'purchase_orders.view': { module: 'purchase_orders', level: 'view' },
  'purchase_orders.edit': { module: 'purchase_orders', level: 'edit' },
  'purchase_orders.approve': { module: 'purchase_orders', level: 'full' },

  'purchase_invoices.view': { module: 'purchase_invoices', level: 'view' },
  'purchase_invoices.edit': { module: 'purchase_invoices', level: 'edit' },
  'purchase_invoices.approve': { module: 'purchase_invoices', level: 'full' },

  'purchase_returns.view': { module: 'purchase_returns', level: 'view' },
  'purchase_returns.edit': { module: 'purchase_returns', level: 'edit' },
  'purchase_returns.approve': { module: 'purchase_returns', level: 'full' },

  'items.view': { module: 'items', level: 'view' },
  'items.edit': { module: 'items', level: 'edit' },
  'items.approve': { module: 'items', level: 'full' },

  'categories.view': { module: 'categories', level: 'view' },
  'categories.manage': { module: 'categories', level: 'full' },

  'stock_adjustments.view': { module: 'stock_adjustments', level: 'view' },
  'stock_adjustments.edit': { module: 'stock_adjustments', level: 'edit' },
  'stock_adjustments.approve': { module: 'stock_adjustments', level: 'full' },

  'uom.view': { module: 'uom', level: 'view' },
  'uom.manage': { module: 'uom', level: 'full' },

  'discounts.view': { module: 'discounts', level: 'view' },
  'discounts.manage': { module: 'discounts', level: 'full' },

  'chart_of_accounts.view': { module: 'chart_of_accounts', level: 'view' },
  'chart_of_accounts.manage': { module: 'chart_of_accounts', level: 'full' },

  'vouchers.view': { module: 'vouchers', level: 'view' },
  'vouchers.edit': { module: 'vouchers', level: 'edit' },
  'vouchers.approve': { module: 'vouchers', level: 'full' },

  'partners.view': { module: 'partners', level: 'view' },
  'partners.edit': { module: 'partners', level: 'edit' },

  'manufacturing.view': { module: 'manufacturing', level: 'view' },
  'manufacturing.manage': { module: 'manufacturing', level: 'full' },

  'services.view': { module: 'services', level: 'view' },
  'services.manage': { module: 'services', level: 'full' },

  'reports.view': { module: 'reports', level: 'view' },

  // Settings & System Controls
  'settings.view': { module: 'settings', level: 'view' },
  'companies.view': { module: 'settings', level: 'view' },
  'companies.edit': { module: 'settings', level: 'edit' },
  'companies.manage_users': { module: 'settings', level: 'full' },

  'users.view': { module: 'settings', level: 'view' },
  'users.create': { module: 'settings', level: 'edit' },
  'users.edit': { module: 'settings', level: 'edit' },
  'users.suspend': { module: 'settings', level: 'full' },
  'users.deactivate': { module: 'settings', level: 'full' },
  'users.remove': { module: 'settings', level: 'full' },
  'users.reset_password': { module: 'settings', level: 'full' },

  'roles.view': { module: 'settings', level: 'view' },
  'roles.create': { module: 'settings', level: 'edit' },
  'roles.edit': { module: 'settings', level: 'edit' },
  'roles.assign': { module: 'settings', level: 'edit' },
  'roles.permissions_manage': { module: 'settings', level: 'full' },

  'approvals.view': { module: 'settings', level: 'view' },
  'approvals.manage': { module: 'settings', level: 'full' },

  'fiscal_year.view': { module: 'settings', level: 'view' },
  'fiscal_year.manage': { module: 'settings', level: 'full' },
  'fiscal_year.close': { module: 'settings', level: 'full' },

  'tax.view': { module: 'settings', level: 'view' },
  'tax.manage': { module: 'settings', level: 'full' },

  'gl_mapping.view': { module: 'chart_of_accounts', level: 'view' },
  'gl_mapping.manage': { module: 'chart_of_accounts', level: 'full' },

  'payroll_mapping.view': { module: 'payroll', level: 'view' },
  'payroll_mapping.manage': { module: 'payroll', level: 'full' },

  'depreciation.view': { module: 'assets', level: 'view' },
  'depreciation.manage': { module: 'assets', level: 'full' },

  'voucher_sequence.view': { module: 'vouchers', level: 'view' },
  'voucher_sequence.manage': { module: 'vouchers', level: 'full' },

  'document_templates.view': { module: 'settings', level: 'view' },
  'document_templates.manage': { module: 'settings', level: 'full' },

  'cutover.view': { module: 'settings', level: 'view' },
  'cutover.execute': { module: 'settings', level: 'full' },

  'security_audit.view': { module: 'settings', level: 'view' },
  'security_audit.export': { module: 'settings', level: 'full' }
};

/**
 * Pure function: Evaluates permission decision.
 */
export function hasPermission({ user, activeCompany, activeRole, membership, permissionKey }) {
  // Fail-Closed Rule: Missing context or unknown keys resolve to false
  if (!user || !permissionKey) return false;

  const roleLower = (user.role || '').toLowerCase();
  const scopeUpper = (user.company_scope || '').toUpperCase();

  // 1. Global Super Admin, Scope ALL, Tenant Admin, or Owner Override
  if (
    user.is_super_admin === true ||
    user.is_super_admin === 'true' ||
    scopeUpper === 'ALL' ||
    roleLower === 'admin' ||
    roleLower === 'tenant_admin' ||
    roleLower === 'owner' ||
    roleLower === 'super_admin' ||
    user.is_tenant_admin === true ||
    user.is_tenant_admin === 'true' ||
    membership?.is_tenant_admin === true ||
    membership?.is_tenant_admin === 'true' ||
    membership?.is_owner === true ||
    membership?.is_owner === 'true'
  ) {
    return true;
  }

  // 2. Company Creator / Primary Workspace Owner Override
  if (activeCompany) {
    const creatorId = activeCompany.created_by || activeCompany.created_by_id || activeCompany.owner_id;
    if (creatorId && (String(creatorId) === String(user.id))) {
      return true;
    }
  }

  // Fail-Closed: User account or workspace membership must be active
  if (user.account_status && user.account_status !== 'active') return false;
  if (membership && membership.membership_status && membership.membership_status !== 'active') return false;

  // 3. Active role check — Profile-Aware Fail-Closed
  if (!activeRole) {
    // Whitelist: global self-service actions that must always work regardless
    // of whether the user has been assigned to a company workspace role yet.
    // This prevents a new/roleless user from being stranded with no escape.
    if (permissionKey.startsWith('profile.') || permissionKey === 'auth.logout') {
      return true;
    }
    // Strict Fail-Closed: deny all ERP tenant module access with no role assigned
    return false;
  }

  // Check direct boolean permission catalog
  const directPerm = activeRole.permissions?.[permissionKey];
  if (directPerm === true) return true;

  // Direct check against activeRole.menu_permissions[permissionKey] object
  if (activeRole.menu_permissions && activeRole.menu_permissions[permissionKey]) {
    const modPerm = activeRole.menu_permissions[permissionKey];
    if (typeof modPerm === 'object') {
      return modPerm.view === true || modPerm.create === true || modPerm.edit === true || modPerm.approve === true;
    }
  }

  // Fallback to legacy menu_permissions evaluation
  const legacyConfig = LEGACY_MODULE_MAP[permissionKey];
  if (legacyConfig && activeRole.menu_permissions) {
    const modPerm = activeRole.menu_permissions[legacyConfig.module];
    if (!modPerm) return false;

    if (legacyConfig.level === 'view') {
      return modPerm.view === true || modPerm.create === true || modPerm.edit === true || modPerm.approve === true;
    }
    if (legacyConfig.level === 'edit') {
      return modPerm.create === true || modPerm.edit === true || modPerm.approve === true;
    }
    if (legacyConfig.level === 'full') {
      return modPerm.approve === true || modPerm.cancel === true || modPerm.reverse === true;
    }
  }

  return false;
}

/**
 * Evaluates route access for a given pathname.
 */
export function canAccessRoute(pathname, user, activeRole, membership, activeCompany) {
  if (!user) return false;

  const roleLower = (user.role || '').toLowerCase();
  const scopeUpper = (user.company_scope || '').toUpperCase();

  // Root Super Admin, Scope ALL, Tenant Admin, or Owner Override (bypasses route restrictions)
  if (
    user.is_super_admin === true ||
    user.is_super_admin === 'true' ||
    scopeUpper === 'ALL' ||
    roleLower === 'admin' ||
    roleLower === 'tenant_admin' ||
    roleLower === 'owner' ||
    roleLower === 'super_admin' ||
    user.is_tenant_admin === true ||
    user.is_tenant_admin === 'true' ||
    membership?.is_tenant_admin === true ||
    membership?.is_tenant_admin === 'true' ||
    membership?.is_owner === true ||
    membership?.is_owner === 'true' ||
    (activeCompany && (String(activeCompany.created_by) === String(user.id)))
  ) {
    return true;
  }

  const normalized = normalizePath(pathname);
  const config = getRoutePermissionConfig(normalized);

  if (config.access === 'denied') return false;
  if (config.access === 'authenticated') return true;

  if (config.access === 'permission') {
    if (!config.permission) return true;
    return hasPermission({ user, activeCompany, activeRole, membership, permissionKey: config.permission });
  }

  return false;
}
