import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth, usePermissions } from '@/lib/AuthContext';
import { sajilo } from '@/api/sajiloClient';
import {
  UserPlus, Shield, Mail, Check, ChevronDown, ChevronUp,
  User, Crown, UserCog, KeyRound, Copy, RefreshCw, Clock, Plus, Trash2, Edit2, Loader2,
  MoreVertical, Eye, Lock, Unlock, UserX, AlertTriangle, CheckCircle, ShieldAlert, History, Link, AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

function generateSecureTempPassword() {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=';
  const randomValues = new Uint32Array(16);
  crypto.getRandomValues(randomValues);
  let password = '';
  for (let i = 0; i < 16; i++) {
    password += charset[randomValues[i] % charset.length];
  }
  return password;
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
  { value: 'edit', label: 'View & Edit (Draft)', color: 'text-amber-600 dark:text-amber-400' },
  { value: 'full', label: 'Full (Approve/Post)', color: 'text-emerald-600 dark:text-emerald-400' },
];

const buildDefaultPerms = (level) => {
  const perms = {};
  MODULE_PERMISSIONS.forEach(g => g.modules.forEach(m => { perms[m.key] = level; }));
  return perms;
};

const baseAdminProfile = { label: 'Tenant Admin', color: 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-500/20', perms: buildDefaultPerms('full') };

const ROLE_PRESETS = {
  admin: baseAdminProfile,
  tenant_admin: baseAdminProfile,
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

export default function UsersRoles() {
  const { activeCompany } = useAuth();
  const { hasAccess } = usePermissions();
  const activeCompanyId = activeCompany?.id || sajilo.getCompanyId();
  const queryClient = useQueryClient();

  const [customRoles, setCustomRoles] = useState([]);
  const [loading, setLoading] = useState(true);

  // TanStack Query for Bulletproof 2-Step Workspace User Fetching
  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['company', activeCompanyId, 'users'],
    queryFn: async () => {
      if (!activeCompanyId) return [];

      // 1. Fetch UserCompany workspace membership records
      const { data: ucList, error: ucError } = await sajilo.auth.supabase
        .from('UserCompany')
        .select('*')
        .eq('company_id', activeCompanyId);

      if (ucError) {
        console.error('[UsersRoles] UserCompany fetch error:', ucError);
        throw ucError;
      }

      if (!ucList || ucList.length === 0) return [];

      const userIds = [...new Set(ucList.map(uc => uc.user_id).filter(Boolean))];
      const roleIds = [...new Set(ucList.map(uc => uc.company_role_id).filter(Boolean))];
      if (userIds.length === 0) return [];

      // 2 & 3. Fetch User profiles AND CompanyRoles concurrently
      const [userProfilesRes, companyRolesRes] = await Promise.all([
        sajilo.auth.supabase
          .from('User')
          .select('id, email, full_name, role, account_status, must_change_password')
          .in('id', userIds),
        roleIds.length > 0
          ? sajilo.auth.supabase
              .from('CompanyRole')
              .select('id, role_name, menu_permissions, sidebar_visibility')
              .in('id', roleIds)
          : Promise.resolve({ data: [], error: null })
      ]);

      if (userProfilesRes.error) {
        console.error('[UsersRoles] User profile fetch error:', userProfilesRes.error);
        throw userProfilesRes.error;
      }

      if (companyRolesRes.error) {
        console.error('[UsersRoles] CompanyRole fetch error:', companyRolesRes.error);
        throw companyRolesRes.error;
      }

      const profileMap = {};
      (userProfilesRes.data || []).forEach(u => { profileMap[u.id] = u; });

      const roleMap = {};
      (companyRolesRes.data || []).forEach(r => { roleMap[r.id] = r; });

      // 4. Merge profile attributes & custom role details with membership status
      return ucList.map(uc => {
        const profile = profileMap[uc.user_id] || {};
        const companyRole = roleMap[uc.company_role_id] || null;
        return {
          ...profile,
          id: profile.id || uc.user_id,
          uc_id: uc.id,
          user_company_id: uc.id,
          membership_status: uc.membership_status || 'active',
          company_role_id: uc.company_role_id,
          company_role: companyRole,
          is_tenant_admin: uc.is_tenant_admin,
          is_owner: uc.is_owner,
          suspended_at: uc.suspended_at,
          deactivated_at: uc.deactivated_at,
          removed_at: uc.removed_at
        };
      });
    },
    enabled: !!activeCompanyId,
    staleTime: 1000 * 60 * 5
  });

  // Dialog & Drawer states
  const [showInvite, setShowInvite] = useState(false);
  const [showPermissions, setShowPermissions] = useState(null);
  const [selectedUserDetail, setSelectedUserDetail] = useState(null);
  const [resetPasswordUser, setResetPasswordUser] = useState(null);

  // Invite & Create state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('user');
  const [invitePreset, setInvitePreset] = useState('viewer');
  const [inviting, setInviting] = useState(false);
  const [createTab, setCreateTab] = useState('invite');
  const [offlineCreateForm, setOfflineCreateForm] = useState({ email: '', full_name: '', temp_password: '' });
  const [creatingOffline, setCreatingOffline] = useState(false);
  const [createdUserOffline, setCreatedUserOffline] = useState(null);

  // Permission editor state
  const [editPerms, setEditPerms] = useState({});
  const [selectedRole, setSelectedRole] = useState('user');
  const [customRoleName, setCustomRoleName] = useState('');
  const [expandedGroups, setExpandedGroups] = useState(MODULE_PERMISSIONS.map(g => g.group));

  // Reset Password State
  const [resetOption, setResetOption] = useState('link'); // 'link' | 'temp'
  const [generatedTempPass, setGeneratedTempPass] = useState('');
  const [resetProcessing, setResetProcessing] = useState(false);
  const [tempPassGenerated, setTempPassGenerated] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeCompanyId) {
        const roles = await sajilo.entities.CompanyRole.filter({ company_id: activeCompanyId });
        setCustomRoles(roles || []);
      }
    } catch (e) {
      console.error("Failed to load user management data:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleLifecycleAction = async (targetUser, actionType, reason = '') => {
    try {
      const companyId = sajilo.getCompanyId();

      let nextStatus = 'active';
      if (actionType === 'SUSPEND_COMPANY_MEMBER') nextStatus = 'suspended';
      else if (actionType === 'DEACTIVATE_COMPANY_MEMBER') nextStatus = 'deactivated';
      else if (actionType === 'REMOVE_COMPANY_MEMBER') nextStatus = 'removed';
      else if (actionType === 'REACTIVATE_COMPANY_MEMBER') nextStatus = 'active';

      const { data, error } = await sajilo.auth.supabase.rpc('execute_user_lifecycle_transition', {
        p_company_id: companyId,
        p_target_user_id: targetUser.id,
        p_next_status: nextStatus,
        p_reason: reason || `Admin action: ${actionType}`
      });

      if (error) throw error;
      toast.success(`Action executed successfully for ${targetUser.full_name || targetUser.email}`);
      queryClient.invalidateQueries({ queryKey: ['company', companyId, 'users'] });
    } catch (e) {
      console.error("Lifecycle RPC Error:", e);
      toast.error(e.message || 'Failed to execute user lifecycle action');
    }
  };

  const handleCreateOffline = async () => {
    if (!offlineCreateForm.email) return toast.error('Email is required');
    if (!offlineCreateForm.temp_password) return toast.error('Temporary password is required');
    try {
      setCreatingOffline(true);
      const companyId = sajilo.getCompanyId();
      await sajilo.users.createOfflineUser(
        offlineCreateForm.email,
        offlineCreateForm.full_name,
        inviteRole,
        companyId,
        offlineCreateForm.temp_password,
        inviteRole === 'admin'
      );
      
      setCreatedUserOffline({ email: offlineCreateForm.email, temp_password: offlineCreateForm.temp_password, role: inviteRole });
      toast.success('Offline user created successfully!');
      queryClient.invalidateQueries({ queryKey: ['company', companyId, 'users'] });
    } catch (e) {
      toast.error(e.message || 'Failed to create offline user');
    } finally {
      setCreatingOffline(false);
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail || !inviteEmail.includes('@')) { toast.error('Enter a valid email'); return; }
    setInviting(true);
    try {
      const companyId = activeCompanyId || sajilo.getCompanyId();
      await sajilo.users.inviteUser(inviteEmail, inviteRole, companyId);
      toast.success(`Invitation sent to ${inviteEmail}`);
      setShowInvite(false);
      setInviteEmail('');
      queryClient.invalidateQueries({ queryKey: ['company', companyId, 'users'] });
    } catch (e) {
      toast.error(e.message || 'Failed to send invitation');
    } finally {
      setInviting(false);
    }
  };

  const openResetPasswordModal = (user) => {
    setResetPasswordUser(user);
    setResetOption('link');
    setGeneratedTempPass('');
    setTempPassGenerated(false);
  };

  const handleExecuteResetPassword = async () => {
    if (!resetPasswordUser) return;
    setResetProcessing(true);
    try {
      if (resetOption === 'link') {
        const { error } = await sajilo.auth.supabase.auth.resetPasswordForEmail(resetPasswordUser.email, {
          redirectTo: `${window.location.origin}/reset-password`
        });
        if (error) throw error;
        toast.success(`Password reset link sent to ${resetPasswordUser.email}`);
        setResetPasswordUser(null);
      } else {
        const tempPass = generateSecureTempPassword();
        setGeneratedTempPass(tempPass);
        const companyId = activeCompanyId || sajilo.getCompanyId();

        // 1. Invoke Edge Function using Dual-Client pattern
        await sajilo.users.resetUserPassword(resetPasswordUser.id, tempPass, companyId);

        queryClient.invalidateQueries({ queryKey: ['company', companyId, 'users'] });
        setTempPassGenerated(true);
        toast.success(`Temporary password generated and active sessions revoked.`);
      }
    } catch (e) {
      console.error(e);
      toast.error(e.message || 'Failed to reset password');
    } finally {
      setResetProcessing(false);
    }
  };

  const openPermissions = (user) => {
    let perms = {};
    let roleName = user.role;
    let customName = '';

    if (user.company_role && user.company_role.menu_permissions) {
      const mp = user.company_role.menu_permissions;
      Object.keys(mp).forEach(k => {
        const p = mp[k];
        if (typeof p === 'object' && p !== null) {
          if (!p.view) perms[k] = 'none';
          else if (p.approve || p.reverse || p.cancel) perms[k] = 'full';
          else if (p.edit || p.create) perms[k] = 'edit';
          else perms[k] = 'view';
        } else if (typeof p === 'string') {
          perms[k] = p;
        }
      });
      roleName = 'custom';
      customName = user.company_role.role_name || 'Custom';
    } else {
      const preset = ROLE_PRESETS[user.role] || ROLE_PRESETS.viewer;
      perms = { ...preset.perms };
    }

    setEditPerms(perms);
    setSelectedRole(roleName);
    setCustomRoleName(customName);
    setShowPermissions(user);
  };

  const toggleGroup = (grp) => setExpandedGroups(prev =>
    prev.includes(grp) ? prev.filter(g => g !== grp) : [...prev, grp]
  );

  const applyPreset = (presetKey) => {
    const preset = ROLE_PRESETS[presetKey];
    if (preset) setEditPerms({ ...preset.perms });
    setSelectedRole(presetKey === 'admin' ? 'admin' : presetKey);
    setCustomRoleName('');
  };

  const applyCustomRole = (role) => {
    const perms = {};
    if (role.menu_permissions) {
      Object.keys(role.menu_permissions).forEach(k => {
        const p = role.menu_permissions[k];
        if (!p.view) perms[k] = 'none';
        else if (p.approve || p.reverse) perms[k] = 'full';
        else if (p.edit || p.create) perms[k] = 'edit';
        else perms[k] = 'view';
      });
    }
    setEditPerms(perms);
    setSelectedRole('custom');
    setCustomRoleName(role.role_name);
  };

  const handleDeleteCustomRole = async (id) => {
    try {
      await sajilo.entities.CompanyRole.delete(id);
      toast.success('Custom role deleted successfully');
      fetchData();
    } catch (e) {
      toast.error('Failed to delete role. It may be assigned to active users.');
    }
  };

  const handleSavePermissions = async () => {
    try {
      const activeCompanyId = sajilo.getCompanyId();
      const visibility = Object.keys(editPerms).filter(k => editPerms[k] && editPerms[k] !== 'none');
      const formattedVisibility = visibility.map(k => {
        if (k === 'vouchers' || k === 'bank_accounts') return '/treasury';
        if (k === 'sales_orders' || k === 'sales_invoices') return '/sales';
        if (k === 'items' || k === 'categories') return '/inventory';
        return `/${k}`;
      });
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
          reverse: level === 'full',
          approve: level === 'full'
        };
      });

      const finalRoleName = selectedRole === 'custom' && customRoleName ? customRoleName : (selectedRole || 'Custom');

      const rolePayload = {
        company_id: activeCompanyId,
        role_name: finalRoleName,
        menu_permissions: booleanPerms,
        sidebar_visibility: [...new Set(formattedVisibility)]
      };
      
      const newRole = await sajilo.entities.CompanyRole.create(rolePayload);

      if (showPermissions) {
        const isTenantAdmin = selectedRole === 'admin';
        await sajilo.entities.User.update(showPermissions.id, {
          role: isTenantAdmin ? 'tenant_admin' : 'user',
          company_scope: 'SELECTED',
          global_role_id: null
        });

        if (activeCompanyId) {
          const ucs = await sajilo.entities.UserCompany.filter({ user_id: showPermissions.id, company_id: activeCompanyId });
          for (const uc of ucs) {
            await sajilo.entities.UserCompany.update(uc.id, { 
              company_role_id: newRole.id,
              is_tenant_admin: isTenantAdmin
            });
          }
        }
        toast.success(`Permissions saved for ${showPermissions.full_name || showPermissions.email}`);
        queryClient.invalidateQueries({ queryKey: ['company', activeCompanyId, 'users'] });
      } else {
        toast.success(`Custom role '${finalRoleName}' created successfully`);
      }

      setShowPermissions(null);
      fetchData();
    } catch (e) {
      console.error(e);
      toast.error('Failed to save permissions to RBAC database');
    }
  };

  const roleInfo = (userOrRole) => {
    const userObj = typeof userOrRole === 'object' ? userOrRole : null;
    const r = (userObj ? userObj.role : userOrRole)?.toLowerCase();
    if (r === 'admin' || r === 'tenant_admin') return { label: 'Tenant Admin', cls: 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-500/20' };
    if (userObj && userObj.company_role?.role_name) {
      return { label: userObj.company_role.role_name, cls: 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20' };
    }
    return { label: 'User', cls: 'bg-slate-100 dark:bg-slate-500/20 text-muted-foreground border border-border' };
  };

  const statusBadge = (accountStatus, membershipStatus) => {
    if (membershipStatus === 'removed') {
      return <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-300 dark:bg-slate-800 dark:text-slate-300 flex items-center gap-1 font-medium"><UserX className="w-3 h-3"/> Removed</span>;
    }
    if (accountStatus === 'suspended' || membershipStatus === 'suspended') {
      return <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 flex items-center gap-1 font-medium"><Lock className="w-3 h-3"/> Suspended</span>;
    }
    if (accountStatus === 'deactivated' || membershipStatus === 'deactivated') {
      return <span className="text-xs px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-300 dark:bg-red-900/30 dark:text-red-300 flex items-center gap-1 font-medium"><UserX className="w-3 h-3"/> Inactive</span>;
    }
    return <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300 flex items-center gap-1 font-medium"><CheckCircle className="w-3 h-3"/> Active</span>;
  };

  return (
    <div className="space-y-5">
      {/* ── User List ── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/20">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-foreground text-sm">System & Workspace Users</h3>
            {!loadingUsers && <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground font-mono">{users.length} users</span>}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="default" onClick={() => setShowInvite(true)}>
              <UserPlus className="w-3.5 h-3.5 mr-1.5" /> Add New User
            </Button>
          </div>
        </div>

        <div className="divide-y divide-border">
          {loadingUsers ? (
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
            <div className="py-10 text-center text-muted-foreground text-sm">No workspace users found</div>
          ) : users.map(user => {
            const ri = roleInfo(user);
            const accStatus = user.account_status || 'active';
            const memStatus = user.membership_status || 'active';

            return (
              <div key={user.id} className="flex items-center gap-4 px-5 py-4 hover:bg-muted/20 transition-colors">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-sm font-semibold text-primary">
                    {(user.full_name || user.email || '?')[0].toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground truncate">{user.full_name || '—'}</p>
                    {statusBadge(accStatus, memStatus)}
                  </div>
                  <p className="text-xs text-muted-foreground truncate font-mono mt-0.5">{user.email}</p>
                </div>

                <span className={cn('text-xs px-2.5 py-1 rounded-full font-medium', ri.cls)}>{ri.label}</span>
                
                {user.must_change_password && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20 flex items-center gap-1">
                    <KeyRound className="w-3 h-3" /> Temp Pass
                  </span>
                )}

                {hasAccess('settings', 'approve') && (
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => openPermissions(user)} className="shrink-0">
                      <Shield className="w-3.5 h-3.5 mr-1.5" /> Permissions
                    </Button>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuLabel>User Actions</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setSelectedUserDetail(user)}>
                          <Eye className="w-4 h-4 mr-2" /> View Details Drawer
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openResetPasswordModal(user)}>
                          <KeyRound className="w-4 h-4 mr-2 text-amber-600" /> Reset Password
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        
                        {memStatus === 'active' && (
                          <>
                            <DropdownMenuItem onClick={() => handleLifecycleAction(user, 'SUSPEND_COMPANY_MEMBER')}>
                              <Lock className="w-4 h-4 mr-2 text-amber-600" /> Suspend Company Access
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleLifecycleAction(user, 'DEACTIVATE_COMPANY_MEMBER')}>
                              <UserX className="w-4 h-4 mr-2 text-orange-600" /> Deactivate Access
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-red-600" onClick={() => handleLifecycleAction(user, 'REMOVE_COMPANY_MEMBER')}>
                              <Trash2 className="w-4 h-4 mr-2" /> Remove from Workspace
                            </DropdownMenuItem>
                          </>
                        )}

                        {(memStatus === 'suspended' || memStatus === 'deactivated' || memStatus === 'removed') && (
                          <DropdownMenuItem onClick={() => handleLifecycleAction(user, 'REACTIVATE_COMPANY_MEMBER')}>
                            <Unlock className="w-4 h-4 mr-2 text-emerald-600" /> Reactivate Access
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Roles & Templates ── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/20">
          <div className="flex items-center gap-2">
            <Crown className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-foreground text-sm">Role Presets & System Templates</h3>
          </div>
          <Button size="sm" variant="secondary" onClick={() => { 
            setSelectedRole('custom'); 
            setCustomRoleName(''); 
            setEditPerms(buildDefaultPerms('none')); 
            setShowPermissions(false);
          }}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Create Custom Role
          </Button>
        </div>
        <div className="p-5 space-y-8">
          <div>
            <p className="text-xs text-muted-foreground mb-4">Standard immutable presets for quick role resolution.</p>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.entries(ROLE_PRESETS).map(([key, preset]) => (
                <div key={key} className={cn('border rounded-lg p-3', preset.color)}>
                  <p className="font-semibold text-sm">{preset.label}</p>
                  <p className="mt-1 text-xs opacity-80 font-mono">
                    {Object.values(preset.perms).filter(v => v === 'full').length} approve/post •{' '}
                    {Object.values(preset.perms).filter(v => v === 'edit').length} draft/edit
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-6 border-t border-border">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-foreground text-sm">Custom Workspace Roles</h3>
            </div>
            
            {customRoles.length === 0 ? (
              <p className="text-xs text-muted-foreground bg-muted/20 p-4 rounded-lg border border-dashed border-border text-center">
                No custom roles created for this workspace yet. Click 'Create Custom Role' to add one.
              </p>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {customRoles.map(role => (
                  <div key={role.id} className="border border-border rounded-lg p-4 bg-card shadow-sm flex flex-col justify-between">
                    <div>
                      <p className="font-semibold text-sm">{role.role_name}</p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">Custom RBAC template</p>
                    </div>
                    <div className="flex gap-2 mt-4 pt-3 border-t border-border">
                      <Button variant="secondary" size="sm" className="flex-1 text-xs h-8" onClick={() => {
                        applyCustomRole(role);
                        setShowPermissions(false);
                      }}>
                        <Edit2 className="w-3 h-3 mr-1.5" /> Edit
                      </Button>
                      <Button variant="outline" size="sm" className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 h-8" 
                        onClick={() => handleDeleteCustomRole(role.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── User Details Drawer / Dialog ── */}
      <Dialog open={selectedUserDetail !== null} onOpenChange={(v) => !v && setSelectedUserDetail(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="w-5 h-5 text-primary" /> User Profile & Security Details
            </DialogTitle>
          </DialogHeader>

          {selectedUserDetail && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-4 bg-muted/30 p-4 rounded-xl border border-border">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
                  {(selectedUserDetail.full_name || selectedUserDetail.email || '?')[0].toUpperCase()}
                </div>
                <div>
                  <h4 className="font-semibold text-foreground text-base">{selectedUserDetail.full_name || 'N/A'}</h4>
                  <p className="text-xs text-muted-foreground font-mono">{selectedUserDetail.email}</p>
                  <div className="mt-1.5 flex gap-2">
                    {statusBadge(selectedUserDetail.account_status, userCompanies[selectedUserDetail.id]?.membership_status)}
                  </div>
                </div>
              </div>

              <Tabs defaultValue="overview">
                <TabsList className="grid grid-cols-3 w-full">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="company">Workspace Role</TabsTrigger>
                  <TabsTrigger value="security">Security Audit</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-3 pt-3">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="bg-muted/20 p-3 rounded-lg border border-border">
                      <span className="text-muted-foreground block mb-1">User ID</span>
                      <span className="font-mono text-foreground font-medium select-all">{selectedUserDetail.id}</span>
                    </div>
                    <div className="bg-muted/20 p-3 rounded-lg border border-border">
                      <span className="text-muted-foreground block mb-1">Company Scope</span>
                      <span className="font-medium text-foreground">{selectedUserDetail.company_scope || 'SELECTED'}</span>
                    </div>
                    <div className="bg-muted/20 p-3 rounded-lg border border-border">
                      <span className="text-muted-foreground block mb-1">Password Last Changed</span>
                      <span className="font-medium text-foreground">{selectedUserDetail.password_last_changed || 'Never'}</span>
                    </div>
                    <div className="bg-muted/20 p-3 rounded-lg border border-border">
                      <span className="text-muted-foreground block mb-1">Force Password Reset</span>
                      <span className="font-medium text-foreground">{selectedUserDetail.must_change_password ? 'YES' : 'NO'}</span>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="company" className="space-y-3 pt-3">
                  <div className="bg-muted/20 p-4 rounded-lg border border-border text-xs space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Global Role:</span>
                      <span className="font-semibold">{selectedUserDetail.role || 'user'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tenant Admin Status:</span>
                      <span className="font-semibold">{userCompanies[selectedUserDetail.id]?.is_tenant_admin ? 'Yes (Full Control)' : 'No'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Company Membership Status:</span>
                      <span className="font-semibold">{userCompanies[selectedUserDetail.id]?.membership_status || 'active'}</span>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="security" className="space-y-3 pt-3">
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 rounded-lg text-xs text-amber-800 dark:text-amber-300">
                    <p className="font-semibold mb-1 flex items-center gap-1.5"><ShieldAlert className="w-4 h-4"/> Security Audit Policy</p>
                    <p>All lifecycle events, session invalidations, and permission updates are immutably logged into <code className="font-mono bg-amber-100 dark:bg-amber-900/40 px-1 rounded">SecurityAuditLog</code> table partitions.</p>
                  </div>
                </TabsContent>
              </Tabs>

              <div className="flex justify-end pt-2">
                <Button variant="outline" onClick={() => setSelectedUserDetail(null)}>Close</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Reset Password Modal (Option A & B) ── */}
      <Dialog open={resetPasswordUser !== null} onOpenChange={(v) => !v && setResetPasswordUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-amber-600" /> Reset User Password
            </DialogTitle>
            <DialogDescription>
              Reset credentials for {resetPasswordUser?.full_name || resetPasswordUser?.email}
            </DialogDescription>
          </DialogHeader>

          {tempPassGenerated ? (
            <div className="space-y-4 pt-2">
              <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 p-4 rounded-lg text-xs text-emerald-800 dark:text-emerald-300">
                <p className="font-semibold mb-1 flex items-center gap-1.5"><CheckCircle className="w-4 h-4"/> Temporary Password Generated!</p>
                <p>Provide this password to the user once. Existing active sessions have been immediately revoked in the database kernel.</p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Temporary Password (16+ Characters)</Label>
                <div className="flex items-center gap-2">
                  <Input value={generatedTempPass} readOnly className="font-mono text-sm font-bold bg-muted/40" />
                  <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(generatedTempPass); toast.success('Copied to clipboard'); }}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button onClick={() => setResetPasswordUser(null)}>Done</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 pt-2">
              <div className="space-y-3">
                <Label>Select Password Reset Method</Label>

                <div 
                  className={cn("p-3 rounded-lg border cursor-pointer transition-all flex items-start gap-3", resetOption === 'link' ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/20")}
                  onClick={() => setResetOption('link')}
                >
                  <Mail className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-xs text-foreground">Option A — Preferred: Secure Password Reset Link</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Sends a secure, one-time reset link directly to {resetPasswordUser?.email}. Old sessions remain protected.</p>
                  </div>
                </div>

                <div 
                  className={cn("p-3 rounded-lg border cursor-pointer transition-all flex items-start gap-3", resetOption === 'temp' ? "border-amber-500 bg-amber-500/5 ring-1 ring-amber-500" : "border-border hover:bg-muted/20")}
                  onClick={() => setResetOption('temp')}
                >
                  <KeyRound className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-xs text-foreground">Option B — Fallback: Temporary Password</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Generates a 16+ character cryptographically secure temporary password, forces password change, and revokes all active sessions.</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-border">
                <Button variant="outline" onClick={() => setResetPasswordUser(null)}>Cancel</Button>
                <Button onClick={handleExecuteResetPassword} disabled={resetProcessing} className={cn(resetOption === 'temp' && "bg-amber-600 hover:bg-amber-700")}>
                  {resetProcessing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin"/> Processing...</> : resetOption === 'link' ? 'Send Reset Link' : 'Generate Temp Password'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Invite User Dialog ── */}
      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><UserPlus className="w-4 h-4" /> Add New User</DialogTitle></DialogHeader>
          <Tabs value={createTab} onValueChange={setCreateTab} className="mt-2">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="invite">Send Email Invite</TabsTrigger>
              <TabsTrigger value="offline">Create Offline</TabsTrigger>
            </TabsList>
            
            <TabsContent value="invite" className="space-y-4 pt-4">
              <div>
                <Label>Email Address *</Label>
                <Input
                  type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                  placeholder="user@company.com" className="h-10 border border-border bg-background px-3 text-sm rounded-md focus:ring-1 focus:ring-primary outline-none mt-1"
                  onKeyDown={e => e.key === 'Enter' && handleInvite()}
                />
              </div>
              <div>
                <Label>System Role</Label>
                <Select value={inviteRole} onValueChange={setInviteRole}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">
                      <div className="flex items-center gap-2"><User className="w-3.5 h-3.5" /><span>User — Standard access</span></div>
                    </SelectItem>
                    <SelectItem value="admin">
                      <div className="flex items-center gap-2"><Crown className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" /><span>Tenant Admin — Full access</span></div>
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
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => setShowInvite(false)}>Cancel</Button>
                <Button onClick={handleInvite} disabled={inviting || !inviteEmail}>
                  {inviting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending...</> : 'Send Invitation'}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="offline" className="pt-4">
              {createdUserOffline ? (
                <div className="space-y-4">
                  <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-lg p-4 text-sm text-emerald-800 dark:text-emerald-300">
                    <p className="font-semibold mb-1">User account created!</p>
                    <p className="mt-1 text-xs">Share these login details securely. The user will be forced to change this password on first login.</p>
                  </div>
                  <div className="bg-muted/40 rounded-lg p-4 space-y-3 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Username (Email)</span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-medium">{createdUserOffline.email}</span>
                        <button onClick={() => { navigator.clipboard.writeText(createdUserOffline.email); toast.success('Copied!'); }} className="p-1 hover:bg-muted rounded"><Copy className="w-3 h-3 text-muted-foreground" /></button>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Temporary Password</span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-semibold bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 px-2 py-0.5 rounded text-amber-800 dark:text-amber-300">{createdUserOffline.temp_password}</span>
                        <button onClick={() => { navigator.clipboard.writeText(createdUserOffline.temp_password); toast.success('Copied!'); }} className="p-1 hover:bg-muted rounded"><Copy className="w-3 h-3 text-muted-foreground" /></button>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={() => setShowInvite(false)}>Done</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <Label>Email Address (Username) *</Label>
                      <Input type="email" value={offlineCreateForm.email} onChange={e => setOfflineCreateForm(f => ({ ...f, email: e.target.value }))} placeholder="staff@company.com" className="mt-1" />
                    </div>
                    <div className="col-span-2">
                      <Label>Full Name</Label>
                      <Input value={offlineCreateForm.full_name} onChange={e => setOfflineCreateForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Jane Doe" className="mt-1" />
                    </div>
                  </div>
                  <div>
                    <Label>System Role</Label>
                    <Select value={inviteRole} onValueChange={setInviteRole}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">
                          <div className="flex items-center gap-2"><User className="w-3.5 h-3.5" /><span>User — Standard access</span></div>
                        </SelectItem>
                        <SelectItem value="admin">
                          <div className="flex items-center gap-2"><Crown className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" /><span>Tenant Admin — Full access</span></div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Temporary Password</Label>
                    <div className="flex gap-2 mt-1">
                      <Input value={offlineCreateForm.temp_password} readOnly className="font-mono bg-muted/30" />
                      <Button variant="outline" size="icon" onClick={() => setOfflineCreateForm(f => ({ ...f, temp_password: generateSecureTempPassword() }))}>
                        <RefreshCw className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                    <Button variant="outline" onClick={() => setShowInvite(false)}>Cancel</Button>
                    <Button onClick={handleCreateOffline} disabled={creatingOffline || !offlineCreateForm.email}>
                      {creatingOffline ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating...</> : 'Create Offline User'}
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* ── Permission Editor Dialog ── */}
      <Dialog open={showPermissions !== null} onOpenChange={(v) => !v && setShowPermissions(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              {showPermissions === false ? 'Create / Edit Custom Role' : `Module Permissions — ${showPermissions?.full_name || showPermissions?.email}`}
            </DialogTitle>
          </DialogHeader>

          <div className="mt-3 space-y-5">
            {showPermissions === false && (
              <div>
                <Label>Role Name</Label>
                <Input 
                  value={customRoleName} 
                  onChange={e => {
                    setCustomRoleName(e.target.value);
                    setSelectedRole('custom');
                  }} 
                  placeholder="e.g. Senior Accountant" 
                  className="mt-1" 
                />
              </div>
            )}

            {/* Quick preset */}
            <div>
              <p className="text-xs text-muted-foreground font-medium mb-2">Quick Load Template:</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(ROLE_PRESETS).map(([key, preset]) => (
                  <button key={key} onClick={() => applyPreset(key)}
                    className={cn('border rounded-lg px-3 py-1.5 text-xs font-medium transition-all hover:opacity-90', preset.color)}>
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Legend / Maker-Checker Info */}
            <div className="space-y-2">
              <div className="flex items-center gap-4 text-xs bg-muted/30 rounded-lg px-3 py-2 border border-border">
                {ACCESS_LEVELS.map(l => (
                  <span key={l.value} className={cn('font-medium', l.color)}>● {l.label}</span>
                ))}
              </div>
              <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 text-blue-800 dark:text-blue-300 rounded-lg p-3 text-xs">
                <strong>Maker-Checker Enforced:</strong> Users with <em>View & Edit (Draft)</em> can create transactions, but they will remain in Draft status. Only users with <em>Full (Approve/Post)</em> can post ledgers and approve records.
              </div>
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
                      return (
                        <div key={mod.key} className="flex items-center justify-between px-4 py-3">
                          <span className="text-sm font-medium">{mod.label}</span>
                          <div className="flex items-center gap-1">
                            {ACCESS_LEVELS.map(level => (
                              <button key={level.value}
                                onClick={() => {
                                  setEditPerms(p => ({ ...p, [mod.key]: level.value }));
                                  if(selectedRole !== 'custom' && showPermissions === false) setSelectedRole('custom');
                                }}
                                className={cn(
                                  'px-2.5 py-1.5 rounded-md text-xs font-medium border transition-all',
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
              <Button onClick={handleSavePermissions} disabled={showPermissions === false && !customRoleName && selectedRole === 'custom'}>
                <Check className="w-3.5 h-3.5 mr-1.5" /> {showPermissions === false ? 'Save Role Template' : 'Save User Permissions'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}