/**
 * Typed Permission Constants Taxonomy (module.resource.action)
 * Mirror of the authoritative database public."Permission" catalog.
 */

export const PERMISSIONS = {
  // Settings & General
  SETTINGS_VIEW: 'settings.view',

  // Security & Users
  USERS_VIEW: 'users.view',
  USERS_CREATE: 'users.create',
  USERS_EDIT: 'users.edit',
  USERS_SUSPEND: 'users.suspend',
  USERS_DEACTIVATE: 'users.deactivate',
  USERS_REMOVE: 'users.remove',
  USERS_RESET_PASSWORD: 'users.reset_password',

  // Roles & Permissions
  ROLES_VIEW: 'roles.view',
  ROLES_CREATE: 'roles.create',
  ROLES_EDIT: 'roles.edit',
  ROLES_ASSIGN: 'roles.assign',
  ROLES_PERMISSIONS_MANAGE: 'roles.permissions_manage',

  // Company Profile & Workspace
  COMPANIES_VIEW: 'companies.view',
  COMPANIES_EDIT: 'companies.edit',
  COMPANIES_MANAGE_USERS: 'companies.manage_users',

  // Approvals
  APPROVALS_VIEW: 'approvals.view',
  APPROVALS_MANAGE: 'approvals.manage',

  // Accounting & Finance
  FISCAL_YEAR_VIEW: 'fiscal_year.view',
  FISCAL_YEAR_MANAGE: 'fiscal_year.manage',
  FISCAL_YEAR_CLOSE: 'fiscal_year.close',

  TAX_VIEW: 'tax.view',
  TAX_MANAGE: 'tax.manage',

  GL_MAPPING_VIEW: 'gl_mapping.view',
  GL_MAPPING_MANAGE: 'gl_mapping.manage',

  PAYROLL_MAPPING_VIEW: 'payroll_mapping.view',
  PAYROLL_MAPPING_MANAGE: 'payroll_mapping.manage',

  DEPRECIATION_VIEW: 'depreciation.view',
  DEPRECIATION_MANAGE: 'depreciation.manage',

  // Operations
  VOUCHER_SEQUENCE_VIEW: 'voucher_sequence.view',
  VOUCHER_SEQUENCE_MANAGE: 'voucher_sequence.manage',

  DOCUMENT_TEMPLATES_VIEW: 'document_templates.view',
  DOCUMENT_TEMPLATES_MANAGE: 'document_templates.manage',

  // System & Data Logistics
  CUTOVER_VIEW: 'cutover.view',
  CUTOVER_EXECUTE: 'cutover.execute',

  // Audit
  SECURITY_AUDIT_VIEW: 'security_audit.view',
  SECURITY_AUDIT_EXPORT: 'security_audit.export',
};
