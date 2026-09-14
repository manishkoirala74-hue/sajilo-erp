-- ============================================================================
-- Migration 120: Database-Backed Permission Catalog & Role Hierarchy
-- ============================================================================

-- 1. Create Permission Catalog Table
CREATE TABLE IF NOT EXISTS public."Permission" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL CHECK (length(trim(key)) > 0),
  module text NOT NULL CHECK (length(trim(module)) > 0),
  resource text NOT NULL CHECK (length(trim(resource)) > 0),
  action text NOT NULL CHECK (length(trim(action)) > 0),
  description text,
  risk_level text NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deprecated')),
  deprecated_at timestamptz,
  replacement_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast key resolution
CREATE INDEX IF NOT EXISTS idx_permission_key ON public."Permission"(key);

-- 2. Add Mathematical Role Hierarchy Weight to CompanyRole
ALTER TABLE public."CompanyRole" 
ADD COLUMN IF NOT EXISTS hierarchy_weight integer NOT NULL DEFAULT 10 CHECK (hierarchy_weight >= 1 AND hierarchy_weight <= 100);

-- 3. Create RolePermission Mapping Table
CREATE TABLE IF NOT EXISTS public."RolePermission" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public."CompanyRole"(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public."Permission"(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT unique_role_permission UNIQUE (role_id, permission_id)
);

CREATE INDEX IF NOT EXISTS idx_role_permission_role ON public."RolePermission"(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permission_perm ON public."RolePermission"(permission_id);

-- 4. Seed Permission Catalog
INSERT INTO public."Permission" (key, module, resource, action, description, risk_level) VALUES
  ('settings.view', 'settings', 'core', 'view', 'View main settings landing page', 'low'),
  ('users.view', 'security', 'users', 'view', 'View user list and profile details', 'low'),
  ('users.create', 'security', 'users', 'create', 'Create or invite new users', 'medium'),
  ('users.edit', 'security', 'users', 'edit', 'Update user profile details', 'medium'),
  ('users.suspend', 'security', 'users', 'suspend', 'Temporarily suspend workspace access', 'high'),
  ('users.deactivate', 'security', 'users', 'deactivate', 'Deactivate user membership', 'high'),
  ('users.remove', 'security', 'users', 'remove', 'Remove user from company workspace', 'high'),
  ('users.reset_password', 'security', 'credentials', 'reset', 'Initiate administrative password reset', 'high'),
  ('roles.view', 'security', 'roles', 'view', 'View assigned & workspace roles', 'low'),
  ('roles.create', 'security', 'roles', 'create', 'Create custom workspace roles', 'high'),
  ('roles.edit', 'security', 'roles', 'edit', 'Edit custom workspace roles', 'high'),
  ('roles.assign', 'security', 'roles', 'assign', 'Assign roles to workspace users', 'high'),
  ('roles.permissions_manage', 'security', 'permissions', 'manage', 'Modify permissions within roles', 'critical'),
  ('companies.view', 'workspace', 'profile', 'view', 'View company workspace profile', 'low'),
  ('companies.edit', 'workspace', 'profile', 'edit', 'Update company profile & settings', 'high'),
  ('companies.manage_users', 'workspace', 'members', 'manage', 'Manage company memberships', 'high'),
  ('approvals.view', 'approvals', 'workflows', 'view', 'View approval limits and policies', 'low'),
  ('approvals.manage', 'approvals', 'workflows', 'manage', 'Modify approval thresholds & limits', 'high'),
  ('fiscal_year.view', 'accounting', 'fiscal_year', 'view', 'View fiscal calendar', 'low'),
  ('fiscal_year.manage', 'accounting', 'fiscal_year', 'manage', 'Create and update fiscal years', 'high'),
  ('fiscal_year.close', 'accounting', 'fiscal_year', 'close', 'Execute year-end fiscal rollover', 'critical'),
  ('tax.view', 'tax', 'matrices', 'view', 'View tax & VAT rates', 'low'),
  ('tax.manage', 'tax', 'matrices', 'manage', 'Configure tax rates & VAT rules', 'high'),
  ('gl_mapping.view', 'accounting', 'gl_mapping', 'view', 'View general ledger account mappings', 'low'),
  ('gl_mapping.manage', 'accounting', 'gl_mapping', 'manage', 'Update account mapping rules', 'high'),
  ('payroll_mapping.view', 'payroll', 'gl_mapping', 'view', 'View payroll GL mappings', 'low'),
  ('payroll_mapping.manage', 'payroll', 'gl_mapping', 'manage', 'Modify payroll GL mappings', 'high'),
  ('depreciation.view', 'assets', 'depreciation', 'view', 'View depreciation rules', 'low'),
  ('depreciation.manage', 'assets', 'depreciation', 'manage', 'Configure depreciation schedules', 'high'),
  ('voucher_sequence.view', 'operations', 'sequences', 'view', 'View voucher numbering sequences', 'low'),
  ('voucher_sequence.manage', 'operations', 'sequences', 'manage', 'Modify voucher numbering sequences', 'high'),
  ('document_templates.view', 'operations', 'templates', 'view', 'View document export templates', 'low'),
  ('document_templates.manage', 'operations', 'templates', 'manage', 'Modify PDF print templates', 'high'),
  ('cutover.view', 'system', 'cutover', 'view', 'View system cut-over utility', 'low'),
  ('cutover.execute', 'system', 'cutover', 'execute', 'Execute data import/cut-over', 'critical'),
  ('security_audit.view', 'audit', 'audit_log', 'view', 'View security audit event log', 'high'),
  ('security_audit.export', 'audit', 'audit_log', 'export', 'Export security audit event log', 'critical')
ON CONFLICT (key) DO NOTHING;
