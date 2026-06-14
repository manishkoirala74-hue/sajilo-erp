import { useState, useEffect } from 'react';
import { sajilo } from '@/api/sajiloClient';
import {
  UserPlus, Shield, Mail, Check, ChevronDown, ChevronUp,
  User, Crown, UserCog, KeyRound, Copy, RefreshCw, Clock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

function generateTempPassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$!';
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ── Permission matrix ──────────────────────────────────────────────────────
const MODULE_PERMISSIONS = [
  {
    group: 'Sales',
    modules: [
      { key: 'sales_orders', label: 'Sales Orders' },
      { key: 'sales_invoices', label: 'Sales Invoices' },
      { key: 'sales_returns', label: 'Sales Returns' },
      { key: 'pos', label: 'POS Terminal' },
    ]
  },
  {
    group: 'Purchase',
    modules: [
      { key: 'purchase_orders', label: 'Purchase Orders' },
      { key: 'purchase_invoices', label: 'Purchase Invoices' },
      { key: 'purchase_returns', label: 'Purchase Returns' },
    ]
  },
  {
    group: 'Inventory',
    modules: [
      { key: 'items', label: 'Items / Products' },
      { key: 'categories', label: 'Item Categories' },
      { key: 'stock_adjustments', label: 'Stock Adjustments' },
      { key: 'uom', label: 'Units of Measure' },
      { key: 'discounts', label: 'Discount Schemes' },
    ]
  },
  {
    group: 'Accounting & Finance',
    modules: [
      { key: 'chart_of_accounts', label: 'Chart of Accounts' },
      { key: 'vouchers', label: 'Financial Vouchers' },
      { key: 'reports', label: 'Reports' },
    ]
  },
  {
    group: 'HR & Payroll',
    modules: [
      { key: 'employees', label: 'Employees' },
      { key: 'payroll', label: 'Payroll Runs' },
    ]
  },
  {
    group: 'Fixed Assets',
    modules: [
      { key: 'assets', label: 'Asset Register' },
      { key: 'asset_compliance', label: 'Asset Compliance' },
    ]
  },
  {
    group: 'Other',
    modules: [
      { key: 'partners', label: 'Business Partners' },
      { key: 'manufacturing', label: 'Manufacturing Orders' },
      { key: 'services', label: 'Service Contracts' },
      { key: 'settings', label: 'Settings' },
    ]
  },
];

const ACCESS_LEVELS = [
  { value: 'none', label: 'No Access', color: 'text-muted-foreground' },
  { value: 'view', label: 'View Only', color: 'text-blue-600 dark:text-blue-400' },
  { value: 'edit', label: 'View & Edit', color: 'text-amber-600 dark:text-amber-400' },
  { value: 'full', label: 'Full Access', color: 'text-emerald-600 dark:text-emerald-400' },
];

// ── Default role presets ───────────────────────────────────────────────────
const buildDefaultPerms = (level) => {
  const perms = {};
  MODULE_PERMISSIONS.forEach(g => g.modules.forEach(m => { perms[m.key] = level; }));
  return perms;
};

const ROLE_PRESETS = {
  admin: { label: 'Admin', color: 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-500/20', perms: buildDefaultPerms('full') },
  manager: {
    label: 'Manager', color: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/20',
    perms: { ...buildDefaultPerms('edit'), settings: 'none', chart_of_accounts: 'view', payroll: 'view' }
  },
  accountant: {
    label: 'Accountant', color: 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20',
    perms: { ...buildDefaultPerms('view'), chart_of_accounts: 'full', vouchers: 'full', reports: 'full', sales_invoices: 'edit', purchase_invoices: 'edit', settings: 'none' }
  },
  sales_rep: {
    label: 'Sales Rep', color: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20',
    perms: { ...buildDefaultPerms('none'), sales_orders: 'full', sales_invoices: 'edit', sales_returns: 'edit', pos: 'full', partners: 'view', items: 'view' }
  },
  warehouse: {
    label: 'Warehouse', color: 'bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-500/20',
    perms: { ...buildDefaultPerms('none'), items: 'full', stock_adjustments: 'full', categories: 'view', uom: 'view', purchase_orders: 'view', purchase_invoices: 'view' }
  },
  viewer: { label: 'Viewer', color: 'bg-slate-100 dark:bg-slate-500/20 text-muted-foreground border-border', perms: buildDefaultPerms('view') },
};

// ── Password expiry preset options ────────────────────────────────────────
const EXPIRY_OPTIONS = [
  { value: 0,   label: 'Never expire' },
  { value: 15,  label: 'Every 15 days' },
  { value: 30,  label: 'Every 30 days (Monthly)' },
  { value: 60,  label: 'Every 60 days' },
  { value: 90,  label: 'Every 90 days (Quarterly)' },
  { value: 180, label: 'Every 180 days (Half-yearly)' },
  { value: 365, label: 'Every 365 days (Yearly)' },
];

// ── Main component ─────────────────────────────────────────────────────────
export default function UsersRoles({ approvalSettings, onApprovalChange }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showPermissions, setShowPermissions] = useState(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('user');
  const [invitePreset, setInvitePreset] = useState('viewer');
  const [inviting, setInviting] = useState(false);
  const [editPerms, setEditPerms] = useState({});
  const [selectedRole, setSelectedRole] = useState('user');
  const [expandedGroups, setExpandedGroups] = useState(MODULE_PERMISSIONS.map(g => g.group));

  // Password policy state (stored in CompanySettings)
  const [passwordExpiryDays, setPasswordExpiryDays] = useState(0);
  const [savingExpiry, setSavingExpiry] = useState(false);
  const [settingsId, setSettingsId] = useState(null);

  // Create user form state
  const [createForm, setCreateForm] = useState({ email: '', full_name: '', role: 'user', temp_password: generateTempPassword() });
  const [creating, setCreating] = useState(false);
  const [createdUser, setCreatedUser] = useState(null);

  useEffect(() => {
    sajilo.entities.User.list().then(data => { setUsers(data); setLoading(false); });
    // Load password policy from CompanySettings
    sajilo.entities.CompanySettings.list().then(data => {
      if (data.length > 0) {
        setSettingsId(data[0].id);
        setPasswordExpiryDays(data[0].password_expiry_days ?? 0);
      }
    });
  }, []);

  const savePasswordPolicy = async () => {
    setSavingExpiry(true);
    if (settingsId) {
      await sajilo.entities.CompanySettings.update(settingsId, { password_expiry_days: passwordExpiryDays });
    }
    toast.success('Password policy saved');
    setSavingExpiry(false);
  };

  const handleInvite = async () => {
    if (!inviteEmail || !inviteEmail.includes('@')) { toast.error('Enter a valid email'); return; }
    setInviting(true);
    await sajilo.users.inviteUser(inviteEmail, inviteRole);
    toast.success(`Invitation sent to ${inviteEmail}`);
    setInviting(false);
    setShowInvite(false);
    setInviteEmail('');
    const data = await sajilo.entities.User.list();
    setUsers(data);
  };

  const handleCreateUser = async () => {
    const email = createForm.email?.trim();
    if (!email || !email.includes('@')) { toast.error('Client Error: Please include an @ in the email address'); return; }
    if (!createForm.temp_password || createForm.temp_password.length < 6) { toast.error('Temp password must be at least 6 characters'); return; }
    
    setCreating(true);
    try {
      // 1. Register the user in Supabase Auth
      const { user: authUser } = await sajilo.auth.signUp(email, createForm.temp_password);
      
      if (authUser) {
        // 2. Explicitly create the public.User profile since they haven't logged in yet
        await sajilo.entities.User.create({
          id: authUser.id,
          email: email,
          role: createForm.role,
          full_name: createForm.full_name,
          company_scope: createForm.role === 'admin' ? 'ALL' : 'SELECTED',
          must_change_password: true,
          temp_password: createForm.temp_password,
          password_last_changed: new Date().toISOString().split('T')[0],
        });

        // 3. Setup UserCompany link with current company
        const activeCompanyId = sajilo.getCompanyId();
        if (activeCompanyId) {
           await sajilo.entities.UserCompany.create({
              user_id: authUser.id,
              company_id: activeCompanyId,
              is_default: true
           });
        }
      } else {
        toast.warning('Auth created, but no user ID returned. Could not link profile automatically.');
      }
      
      setUsers(await sajilo.entities.User.list());
      setCreatedUser({ ...createForm });
    } catch (e) {
      console.error("Create User Error:", e);
      toast.error(e?.message || 'Failed to create user account. It may already exist.');
    } finally {
      setCreating(false);
    }
  };

  const resetCreateForm = () => {
    setCreateForm({ email: '', full_name: '', role: 'user', temp_password: generateTempPassword() });
    setCreatedUser(null);
    setShowCreate(false);
  };

  const openPermissions = (user) => {
    const preset = ROLE_PRESETS[user.role] || ROLE_PRESETS.viewer;
    setEditPerms({ ...preset.perms });
    setSelectedRole(user.role);
    setShowPermissions(user);
  };

  const toggleGroup = (grp) => setExpandedGroups(prev =>
    prev.includes(grp) ? prev.filter(g => g !== grp) : [...prev, grp]
  );

  const applyPreset = (presetKey) => {
    const preset = ROLE_PRESETS[presetKey];
    if (preset) setEditPerms({ ...preset.perms });
    setSelectedRole(presetKey === 'admin' ? 'admin' : 'user');
  };

  const handleSavePermissions = async () => {
    try {
      const activeCompanyId = sajilo.getCompanyId();
      
      // 1. Create a dynamic CompanyRole from the UI matrix
      const visibility = Object.keys(editPerms).filter(k => editPerms[k] && editPerms[k] !== 'none');
      const formattedVisibility = visibility.map(k => {
         if (k === 'vouchers' || k === 'bank_accounts') return '/treasury';
         if (k === 'sales_orders' || k === 'sales_invoices') return '/sales';
         if (k === 'items' || k === 'categories') return '/inventory';
         return `/${k}`;
      });
      // Add root paths
      formattedVisibility.push('/', '/settings', '/reports');

      const booleanPerms = {};
      Object.keys(editPerms).forEach(k => {
         const level = editPerms[k];
         if (level === 'none') return;
         booleanPerms[k] = {
           view: true,
           create: level === 'edit' || level === 'full',
           edit: level === 'edit' || level === 'full',
           cancel: level === 'full',
           reverse: level === 'full'
         };
      });

      const rolePayload = {
         company_id: activeCompanyId,
         role_name: selectedRole || 'Custom',
         menu_permissions: booleanPerms,
         sidebar_visibility: [...new Set(formattedVisibility)]
      };
      const newRole = await sajilo.entities.CompanyRole.create(rolePayload);

      // 2. Update User Global Flags
      await sajilo.entities.User.update(showPermissions.id, {
        role: selectedRole === 'admin' ? 'admin' : 'user',
        company_scope: selectedRole === 'admin' ? 'ALL' : 'SELECTED',
        global_role_id: selectedRole === 'admin' ? newRole.id : null
      });

      // 3. Update UserCompany Assignment
      if (selectedRole !== 'admin' && activeCompanyId) {
         const ucs = await sajilo.entities.UserCompany.filter({ user_id: showPermissions.id, company_id: activeCompanyId });
         for (const uc of ucs) {
            await sajilo.entities.UserCompany.update(uc.id, { company_role_id: newRole.id });
         }
      }

      toast.success('Permissions saved securely to RBAC matrix for ' + (showPermissions?.full_name || showPermissions?.email));
      setShowPermissions(null);
      setUsers(await sajilo.entities.User.list());
    } catch (e) {
      console.error(e);
      toast.error('Failed to save permissions to RBAC database');
    }
  };

  const roleInfo = (role) => {
    const r = role?.toLowerCase();
    if (r === 'admin') return { label: 'Admin', cls: 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-500/20' };
    return { label: 'User', cls: 'bg-slate-100 dark:bg-slate-500/20 text-muted-foreground border border-border' };
  };

  return (
    <div className="space-y-5">
      {/* ── User List ── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/20">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-foreground text-sm">System Users</h3>
            {!loading && <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{users.length} users</span>}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowInvite(true)}>
              <Mail className="w-3.5 h-3.5 mr-1.5" /> Invite by Email
            </Button>
            <Button size="sm" onClick={() => { setCreatedUser(null); setCreateForm({ email: '', role: 'user', temp_password: generateTempPassword() }); setShowCreate(true); }}>
              <UserCog className="w-3.5 h-3.5 mr-1.5" /> Create User
            </Button>
          </div>
        </div>

        <div className="divide-y divide-border">
          {loading ? (
            Array(3).fill(0).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <div className="w-9 h-9 rounded-full bg-muted animate-pulse" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 bg-muted rounded w-40 animate-pulse" />
                  <div className="h-3 bg-muted rounded w-56 animate-pulse" />
                </div>
              </div>
            ))
          ) : users.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground text-sm">No users found</div>
          ) : users.map(user => {
            const ri = roleInfo(user.role);
            return (
              <div key={user.id} className="flex items-center gap-4 px-5 py-4 hover:bg-muted/20 transition-colors">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-sm font-semibold text-primary">
                    {(user.full_name || user.email || '?')[0].toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{user.full_name || '—'}</p>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                </div>
                <span className={cn('text-xs px-2.5 py-1 rounded-full font-medium', ri.cls)}>{ri.label}</span>
                {user.must_change_password && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20 flex items-center gap-1">
                    <KeyRound className="w-3 h-3" /> Temp Password
                  </span>
                )}
                <Button variant="outline" size="sm" onClick={() => openPermissions(user)} className="shrink-0">
                  <Shield className="w-3.5 h-3.5 mr-1.5" /> Permissions
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Role Presets Reference ── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border bg-muted/20">
          <Crown className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-foreground text-sm">Role Presets</h3>
        </div>
        <div className="p-5">
          <p className="text-xs text-muted-foreground mb-4">Apply these presets when configuring user permissions. Each preset comes with predefined module access.</p>
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(ROLE_PRESETS).map(([key, preset]) => (
              <div key={key} className={cn('border rounded-lg p-3', preset.color)}>
                <p className="font-semibold text-sm">{preset.label}</p>
                <p className="mt-1 text-xs opacity-80">
                  {Object.values(preset.perms).filter(v => v === 'full').length} full •{' '}
                  {Object.values(preset.perms).filter(v => v === 'edit').length} edit •{' '}
                  {Object.values(preset.perms).filter(v => v === 'view').length} view •{' '}
                  {Object.values(preset.perms).filter(v => v === 'none').length} restricted
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Password Policy ── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border bg-muted/20">
          <Clock className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-foreground text-sm">Password Policy</h3>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <Label>Password Expiry Frequency</Label>
            <p className="text-xs text-muted-foreground mb-2 mt-0.5">Users will be required to change their password after this period.</p>
            <div className="flex gap-3 items-center">
              <Select value={String(passwordExpiryDays)} onValueChange={v => setPasswordExpiryDays(Number(v))}>
                <SelectTrigger className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPIRY_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={savePasswordPolicy} disabled={savingExpiry}>
                {savingExpiry ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
          {passwordExpiryDays > 0 && (
            <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <KeyRound className="w-3.5 h-3.5 inline mr-1" />
              Users will be prompted to change their password every <strong>{passwordExpiryDays} days</strong>. They cannot access the system until they do so.
            </div>
          )}
        </div>
      </div>

      {/* ── Approval Settings ── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border bg-muted/20">
          <Shield className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-foreground text-sm">Approval Controls</h3>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between py-3 border-b border-border">
            <div>
              <p className="text-sm font-medium">Enable Purchase Order Approvals</p>
              <p className="text-xs text-muted-foreground mt-0.5">Require manager approval for POs above the limit</p>
            </div>
            <Switch checked={!!approvalSettings?.enable_approvals} onCheckedChange={v => onApprovalChange('enable_approvals', v)} />
          </div>
          <div>
            <Label>Approval Limit Amount (NPR)</Label>
            <p className="text-xs text-muted-foreground mb-1.5">POs above this value require approval</p>
            <Input type="number" value={approvalSettings?.approval_limit_amount || 50000}
              onChange={e => onApprovalChange('approval_limit_amount', Number(e.target.value))}
              className="h-10 border border-border bg-background px-3 text-sm rounded-md focus:ring-1 focus:ring-primary outline-none mt-1 font-mono text-right" />
          </div>
        </div>
      </div>

      {/* ── Create User Dialog ── */}
      <Dialog open={showCreate} onOpenChange={v => { if (!v) resetCreateForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCog className="w-4 h-4" /> Create User Account
            </DialogTitle>
          </DialogHeader>

          {createdUser ? (
            <div className="space-y-4 mt-2">
              <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-lg p-4 text-sm text-emerald-800 dark:text-emerald-300">
                <p className="font-semibold mb-1">✓ User account created!</p>
                <p className="mt-1 text-xs ">The user must verify their email via the OTP sent to <strong>{createdUser.email}</strong>, then log in with the temporary password below.</p>
              </div>
              <div className="bg-muted/40 rounded-lg p-4 space-y-3 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Username (Email)</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-medium">{createdUser.email}</span>
                    <button onClick={() => { navigator.clipboard.writeText(createdUser.email); toast.success('Copied!'); }} className="p-1 hover:bg-muted rounded">
                      <Copy className="w-3 h-3 text-muted-foreground" />
                    </button>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Temporary Password</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-semibold bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 px-2 py-0.5 rounded text-amber-800 dark:text-amber-300">{createdUser.temp_password}</span>
                    <button onClick={() => { navigator.clipboard.writeText(createdUser.temp_password); toast.success('Copied!'); }} className="p-1 hover:bg-muted rounded">
                      <Copy className="w-3 h-3 text-muted-foreground" />
                    </button>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Role</span>
                  <span className="capitalize font-medium">{createdUser.role}</span>
                </div>
              </div>
              <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                ⚠ Copy the temporary password now — it will not be shown again. The user must change it on first login.
              </div>
              <div className="flex justify-end">
                <Button onClick={resetCreateForm}>Done</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 mt-2">
              <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-lg p-3 text-xs text-blue-700 dark:text-blue-400">
                The account is created immediately. The user logs in with the temporary password and must change it before using the system.
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label>Email Address (Username) *</Label>
                  <Input type="email" value={createForm.email} onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="john@company.com" className="h-10 border border-border bg-background px-3 text-sm rounded-md focus:ring-1 focus:ring-primary outline-none mt-1 " />
                </div>
                <div className="col-span-2">
                  <Label>Full Name</Label>
                  <Input value={createForm.full_name} onChange={e => setCreateForm(f => ({ ...f, full_name: e.target.value }))}
                    placeholder="John Doe" className="h-10 border border-border bg-background px-3 text-sm rounded-md focus:ring-1 focus:ring-primary outline-none mt-1 " />
                </div>
              </div>
              <div>
                <Label>System Role</Label>
                <Select value={createForm.role} onValueChange={v => setCreateForm(f => ({ ...f, role: v }))}>
                  <SelectTrigger className="mt-1 "><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user"><div className="flex items-center gap-2"><User className="w-3.5 h-3.5" /> User — Standard access</div></SelectItem>
                    <SelectItem value="admin"><div className="flex items-center gap-2"><Crown className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" /> Admin — Full access</div></SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Temporary Password</Label>
                <div className="h-10 border border-border bg-background px-3 text-sm rounded-md focus:ring-1 focus:ring-primary outline-none mt-1 flex gap-2 ">
                  <Input value={createForm.temp_password} onChange={e => setCreateForm(f => ({ ...f, temp_password: e.target.value }))} className="font-mono" />
                  <Button variant="outline" size="icon" onClick={() => setCreateForm(f => ({ ...f, temp_password: generateTempPassword() }))}>
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground ">User must change this on first login.</p>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={resetCreateForm}>Cancel</Button>
                <Button onClick={handleCreateUser} disabled={creating}>
                  {creating ? 'Creating…' : 'Create User'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Invite User Dialog ── */}
      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><UserPlus className="w-4 h-4" /> Invite New User</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Email Address *</Label>
              <Input
                type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                placeholder="user@company.com" className="h-10 border border-border bg-background px-3 text-sm rounded-md focus:ring-1 focus:ring-primary outline-none mt-1 "
                onKeyDown={e => e.key === 'Enter' && handleInvite()}
              />
            </div>
            <div>
              <Label>System Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger className="mt-1 "><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">
                    <div className="flex items-center gap-2"><User className="w-3.5 h-3.5" /><span>User — Standard access</span></div>
                  </SelectItem>
                  <SelectItem value="admin">
                    <div className="flex items-center gap-2"><Crown className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" /><span>Admin — Full access</span></div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Permission Preset</Label>
              <p className="text-xs text-muted-foreground mb-1.5">Sets default module access when permissions are configured</p>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(ROLE_PRESETS).map(([key, preset]) => (
                  <button key={key} onClick={() => setInvitePreset(key)}
                    className={cn('border rounded-lg px-3 py-2 text-xs font-medium transition-all', preset.color,
                      invitePreset === key ? 'ring-2 ring-primary ring-offset-1' : 'opacity-70 hover:opacity-100'
                    )}>
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-lg p-3 text-xs text-blue-700 dark:text-blue-400">
              <Mail className="w-3.5 h-3.5 inline mr-1" />
              An invitation email will be sent. The user must register to activate their account.
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setShowInvite(false)}>Cancel</Button>
              <Button onClick={handleInvite} disabled={inviting}>
                {inviting ? 'Sending…' : 'Send Invitation'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Permission Editor Dialog ── */}
      <Dialog open={!!showPermissions} onOpenChange={() => setShowPermissions(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              Module Permissions — {showPermissions?.full_name || showPermissions?.email}
            </DialogTitle>
          </DialogHeader>

          <div className="mt-3 space-y-4">
            {/* Quick preset */}
            <div>
              <p className="text-xs text-muted-foreground font-medium mb-2">Quick Apply Preset:</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(ROLE_PRESETS).map(([key, preset]) => (
                  <button key={key} onClick={() => applyPreset(key)}
                    className={cn('border rounded-lg px-3 py-1.5 text-xs font-medium transition-all hover:opacity-90', preset.color)}>
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 text-xs bg-muted/30 rounded-lg px-3 py-2">
              {ACCESS_LEVELS.map(l => (
                <span key={l.value} className={cn('font-medium', l.color)}>● {l.label}</span>
              ))}
            </div>

            {/* Permission groups */}
            {MODULE_PERMISSIONS.map(group => (
              <div key={group.group} className="border border-border rounded-xl overflow-hidden">
                <button
                  onClick={() => toggleGroup(group.group)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-sm font-semibold"
                >
                  <span>{group.group}</span>
                  {expandedGroups.includes(group.group)
                    ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    : <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  }
                </button>
                {expandedGroups.includes(group.group) && (
                  <div className="divide-y divide-border">
                    {group.modules.map(mod => {
                      const current = editPerms[mod.key] || 'none';
                      const info = ACCESS_LEVELS.find(l => l.value === current);
                      return (
                        <div key={mod.key} className="flex items-center justify-between px-4 py-3">
                          <span className="text-sm">{mod.label}</span>
                          <div className="flex items-center gap-1">
                            {ACCESS_LEVELS.map(level => (
                              <button key={level.value}
                                onClick={() => setEditPerms(p => ({ ...p, [mod.key]: level.value }))}
                                className={cn(
                                  'px-2.5 py-1 rounded-md text-xs font-medium border transition-all',
                                  current === level.value
                                    ? cn('border-current font-semibold', level.color, current === 'none' ? 'bg-muted border-muted-foreground/30' : current === 'view' ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-300 dark:border-blue-500/30' : current === 'edit' ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-300 dark:border-amber-500/30' : 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/30')
                                    : 'border-transparent text-muted-foreground hover:bg-muted/50'
                                )}>
                                {level.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}

            <div className="flex justify-end gap-3 pt-2 border-t border-border">
              <Button variant="outline" onClick={() => setShowPermissions(null)}>Cancel</Button>
              <Button onClick={handleSavePermissions}>
                <Check className="w-3.5 h-3.5 mr-1.5" /> Save Permissions
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}