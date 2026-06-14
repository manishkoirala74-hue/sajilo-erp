import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { sajilo } from '@/api/sajiloClient';
import {
  Save, Users, Settings2, FileText, Mail,
  ChevronRight, Globe, Bell, Hash, Palette, Database, TrendingDown, FileSpreadsheet, BookOpen, Calendar, HardDrive, Percent,
  Building2, Landmark, Briefcase, DatabaseBackup
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import DateInput from '@/components/shared/DateInput';
import UsersRoles from '@/components/settings/UsersRoles';
import DepreciationSettings from '@/components/settings/DepreciationSettings';
import QuotationSettings from '@/components/settings/QuotationSettings';
import OpeningBalances from '@/components/settings/OpeningBalances.jsx';
import ItemImportExport from '@/components/settings/ItemImportExport';
import DataUtilities from '@/components/settings/DataUtilities';
import CommunicationSettings from '@/components/settings/CommunicationSettings';

import GLAccountSettings from '@/components/settings/GLAccountSettings';
import PayrollGLSettings from '@/components/settings/PayrollGLSettings';
import CompanyManagement from '@/components/settings/CompanyManagement';
import FiscalYearSettings from '@/components/settings/FiscalYearSettings';
import TaxSettings from '@/components/settings/TaxSettings';
import { cn } from '@/lib/utils';

const HUBS = [
  { id: 'workspace', label: 'Company Workspace', icon: Building2, adminOnly: true },
  { id: 'finance', label: 'Finance & Tax Controls', icon: Landmark },
  { id: 'operations', label: 'Operational Features', icon: Briefcase },
  { id: 'logistics', label: 'Data Logistics', icon: DatabaseBackup },
  { id: 'integrations', label: 'App & Integrations', icon: Settings2 },
];

function SectionCard({ title, icon: CardIcon, children }) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border bg-muted/20">
        <CardIcon className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-foreground text-sm">{title}</h3>
      </div>
      <div className="p-5 bg-background text-foreground">{children}</div>
    </div>
  );
}

function ToggleRow({ label, desc, checked, onChange }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0 text-foreground">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        {desc && <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>}
      </div>
      <Switch checked={!!checked} onCheckedChange={onChange} />
    </div>
  );
}

const DEFAULT_SETTINGS = {
  company_name: 'My Company', currency: 'NPR', address: '', phone: '', email: '',
  tax_id: '', vat_rate: 13, tax_charge_type: 'Exclusive', default_payment_term_days: 30,
  fiscal_year_start: '2026-04-01', date_format: 'AD',
  enable_purchase_orders: true, enable_approvals: true, approval_limit_amount: 50000, enable_landed_costs: false,
  item_image_max_size_mb: 2, item_image_max_count: 3,
  invoice_prefix_sales: 'SI', invoice_prefix_purchase: 'PI',
  invoice_prefix_sales_order: 'SO', invoice_prefix_purchase_order: 'PO',
  invoice_suffix: '', invoice_next_number: 1, include_fy_in_invoice_number: true,
  invoice_numbering_method: 'Auto', invoice_duplicate_handling: 'Block',
  show_recent_trading_history: true,
  overdue_reminder_days: 7, send_invoice_reminder_on_due: true, self_reminder_days_before_due: 3,
  email_smtp_host: '', email_smtp_port: 587, email_smtp_user: '', email_smtp_password: '', email_from_name: '',
  email_debtor_template: 'Dear {customer_name},\n\nThis is a reminder that invoice {invoice_number} for NPR {amount} is due on {due_date}.\n\nPlease make the payment at your earliest convenience.\n\nRegards,\n{company_name}',
  opening_balance_date: '',
  enable_pos_module: true, enable_manufacturing_module: true, enable_hr_module: true,
  enable_assets_module: true, enable_services_module: true,
  dep_default_method: 'Straight-Line', dep_default_rate_percent: 20,
  dep_use_rate_override: false, dep_posting_mode: 'Accumulated',
  dep_factory_expense_account_id: '', dep_factory_expense_account_name: '',
  dep_admin_expense_account_id: '', dep_admin_expense_account_name: '',
  dep_accumulated_machinery_account_id: '', dep_accumulated_machinery_account_name: '',
  dep_accumulated_office_account_id: '', dep_accumulated_office_account_name: '',
  dep_accumulated_vehicle_account_id: '', dep_accumulated_vehicle_account_name: '',
};

export default function Settings() {
  const { user } = useAuth();
  const [activeHub, setActiveHub] = useState('workspace');
  const [settings, setSettings] = useState(null);
  const [settingsId, setSettingsId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    sajilo.entities.CompanySettings.list().then(data => {
      if (data.length > 0) { setSettings({ ...DEFAULT_SETTINGS, ...data[0] }); setSettingsId(data[0].id); }
      else setSettings({ ...DEFAULT_SETTINGS });
      setLoading(false);
    });
  }, []);

  const set = (key, val) => setSettings(s => ({ ...s, [key]: val }));

  const handleSave = async () => {
    if (!settings.company_name) { toast.error('Company name is required'); return; }
    setSaving(true);
    
    // Sanitize payload
    const payload = { ...settings };
    if (payload.opening_balance_date === '') payload.opening_balance_date = null;
    if (typeof payload.hr_earning_mappings === 'object') payload.hr_earning_mappings = JSON.stringify(payload.hr_earning_mappings);
    if (typeof payload.hr_deduction_mappings === 'object') payload.hr_deduction_mappings = JSON.stringify(payload.hr_deduction_mappings);
    
    // Sanitize all empty strings for foreign keys to prevent Supabase type errors
    Object.keys(payload).forEach(key => {
      if (key.endsWith('_id') && payload[key] === '') {
        payload[key] = null;
      }
      if (key.endsWith('_name') && !['company_name', 'email_from_name'].includes(key)) {
        delete payload[key];
      }
    });

    delete payload.id;
    delete payload.company_id;
    delete payload.created_at;

    try {
      if (settingsId) {
        await sajilo.entities.CompanySettings.update(settingsId, payload);
      } else {
        const c = await sajilo.entities.CompanySettings.create(payload);
        setSettingsId(c.id);
      }
      toast.success('Settings saved');
    } catch (e) {
      console.error("Failed to save settings:", e);
      // Detailed error for debugging
      const errorMsg = e?.message || e?.details || e?.hint || JSON.stringify(e) || 'Unknown error';
      toast.error(`Failed to save settings: ${errorMsg}`, { duration: 10000 });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-40"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div className="flex gap-6 max-w-6xl">
      {/* Sidebar */}
      <div className="w-64 shrink-0 space-y-1">
        {HUBS.filter(s => !s.adminOnly || user?.role === 'admin').map(s => {
          const SIcon = s.icon;
          return (
          <button key={s.id} onClick={() => setActiveHub(s.id)}
            className={cn('w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left',
              activeHub === s.id ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
            )}>
            <SIcon className="w-4 h-4 shrink-0" />
            <span>{s.label}</span>
            {activeHub === s.id && <ChevronRight className="w-3.5 h-3.5 ml-auto" />}
          </button>
          );
        })}
        <div className="pt-4">
          <Button onClick={handleSave} disabled={saving} className="w-full">
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving…' : 'Save All Settings'}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="h-auto flex flex-col w-full gap-4 text-foreground">

        {/* ── HUB 1: COMPANY WORKSPACE ── */}
        {activeHub === 'workspace' && (
          <>
            <CompanyManagement />
            <SectionCard title="Users & Access Roles" icon={Users}>
              <UsersRoles
                approvalSettings={settings}
                onApprovalChange={(key, val) => set(key, val)}
              />
            </SectionCard>
          </>
        )}

        {/* ── HUB 2: FINANCE & TAX CONTROLS ── */}
        {activeHub === 'finance' && (
          <>
            <SectionCard title="Fiscal Calendar & Rollover" icon={Calendar}>
              <FiscalYearSettings />
            </SectionCard>
            <SectionCard title="Tax & VAT Matrices" icon={Percent}>
              <TaxSettings />
            </SectionCard>
            <SectionCard title="GL Account Mapping" icon={BookOpen}>
              <GLAccountSettings
                settings={settings}
                onChange={updates => setSettings(s => ({ ...s, ...updates }))}
              />
              <div className="mt-8 border-t border-border pt-8"></div>
              <PayrollGLSettings
                settings={settings}
                onChange={updates => setSettings(s => ({ ...s, ...updates }))}
              />
              <div className="mt-8 pt-4 border-t border-border flex justify-end">
                <Button onClick={handleSave} disabled={saving}>
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? 'Saving...' : 'Save Mappings'}
                </Button>
              </div>
            </SectionCard>
            <DepreciationSettings settings={settings} onChange={(key, val) => set(key, val)} />
          </>
        )}

        {/* ── HUB 3: OPERATIONAL FEATURES ── */}
        {activeHub === 'operations' && (
          <>
            <SectionCard title="Receivable Collections (Reminders)" icon={Bell}>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-foreground">Overdue Reminder (days after due)</Label>
                  <p className="text-xs text-muted-foreground mb-1">Send reminder email N days after invoice due date</p>
                  <Input type="number" min={1} value={settings.overdue_reminder_days || 7} onChange={e => set('overdue_reminder_days', Number(e.target.value))} className="mt-1 h-10 border border-border bg-background px-3 text-sm rounded-md focus:ring-1 focus:ring-primary outline-none font-mono text-right" />
                </div>
                <div>
                  <Label className="text-foreground">Self Reminder (days before due)</Label>
                  <p className="text-xs text-muted-foreground mb-1">Internal alert N days before invoice becomes due</p>
                  <Input type="number" min={1} value={settings.self_reminder_days_before_due || 3} onChange={e => set('self_reminder_days_before_due', Number(e.target.value))} className="mt-1 h-10 border border-border bg-background px-3 text-sm rounded-md focus:ring-1 focus:ring-primary outline-none font-mono text-right" />
                </div>
              </div>
              <div className="mt-3">
                <ToggleRow label="Auto-send Reminder on Due Date" desc="Automatically email the customer on the invoice due date" checked={settings.send_invoice_reminder_on_due} onChange={v => set('send_invoice_reminder_on_due', v)} />
              </div>
            </SectionCard>

            <SectionCard title="Voucher Sequence Configuration" icon={Hash}>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <Label className="text-foreground">Numbering Method</Label>
                  <p className="text-xs text-muted-foreground mb-2">Choose how invoice numbers are assigned</p>
                  <Select value={settings.invoice_numbering_method || 'Auto'} onValueChange={v => set('invoice_numbering_method', v)}>
                    <SelectTrigger className="h-10 border border-border bg-background px-3 text-sm rounded-md focus:ring-1 focus:ring-primary outline-none"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Auto">Auto Numbering — system assigns sequential numbers</SelectItem>
                      <SelectItem value="Manual">Manual Numbering — user enters the invoice number</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {settings.invoice_numbering_method === 'Manual' && (
                  <div>
                    <Label className="text-foreground">Duplicate Number Handling</Label>
                    <p className="text-xs text-muted-foreground mb-2">What happens if the same number is entered twice</p>
                    <Select value={settings.invoice_duplicate_handling || 'Block'} onValueChange={v => set('invoice_duplicate_handling', v)}>
                      <SelectTrigger className="h-10 border border-border bg-background px-3 text-sm rounded-md focus:ring-1 focus:ring-primary outline-none"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Block">Block — Reject duplicate numbers entirely</SelectItem>
                        <SelectItem value="Warn">Warn — Show warning but allow proceeding</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              {settings.invoice_numbering_method === 'Manual' && (
                <div className={`mt-4 flex items-start gap-2 rounded-lg px-4 py-3 text-sm ${settings.invoice_duplicate_handling === 'Warn' ? 'bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/20 text-yellow-800 dark:text-yellow-300' : 'bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-800 dark:text-red-300'}`}>
                  <span className="text-base">{settings.invoice_duplicate_handling === 'Warn' ? '⚠️' : '🚫'}</span>
                  <div>
                    {settings.invoice_duplicate_handling === 'Warn'
                      ? <><strong>Warn mode:</strong> Users will see a warning if a duplicate invoice number is entered, but can choose to proceed.</>
                      : <><strong>Block mode:</strong> The system will reject any invoice number that already exists in the database — no duplicates allowed.</>
                    }
                  </div>
                </div>
              )}
            </SectionCard>

            <SectionCard title="Document Numbering (Prefix / Suffix)" icon={Hash}>
              <p className="text-xs text-muted-foreground mb-4">Used for Auto Numbering mode. Documents are numbered as: <span className="font-mono bg-muted px-1 rounded">[Prefix]-[Year]-[Number][Suffix]</span></p>
              <div className="grid grid-cols-3 gap-4">
                <div><Label className="text-foreground">Sales Invoice Prefix</Label><Input value={settings.invoice_prefix_sales || 'SI'} onChange={e => set('invoice_prefix_sales', e.target.value)} className="mt-1 h-10 border border-border bg-background px-3 text-sm rounded-md focus:ring-1 focus:ring-primary outline-none font-mono" placeholder="SI" /></div>
                <div><Label className="text-foreground">Purchase Invoice Prefix</Label><Input value={settings.invoice_prefix_purchase || 'PI'} onChange={e => set('invoice_prefix_purchase', e.target.value)} className="mt-1 h-10 border border-border bg-background px-3 text-sm rounded-md focus:ring-1 focus:ring-primary outline-none font-mono" placeholder="PI" /></div>
                <div><Label className="text-foreground">Sales Order Prefix</Label><Input value={settings.invoice_prefix_sales_order || 'SO'} onChange={e => set('invoice_prefix_sales_order', e.target.value)} className="mt-1 h-10 border border-border bg-background px-3 text-sm rounded-md focus:ring-1 focus:ring-primary outline-none font-mono" placeholder="SO" /></div>
                <div><Label className="text-foreground">Purchase Order Prefix</Label><Input value={settings.invoice_prefix_purchase_order || 'PO'} onChange={e => set('invoice_prefix_purchase_order', e.target.value)} className="mt-1 h-10 border border-border bg-background px-3 text-sm rounded-md focus:ring-1 focus:ring-primary outline-none font-mono" placeholder="PO" /></div>
                <div><Label className="text-foreground">Common Suffix (optional)</Label><Input value={settings.invoice_suffix || ''} onChange={e => set('invoice_suffix', e.target.value)} className="mt-1 h-10 border border-border bg-background px-3 text-sm rounded-md focus:ring-1 focus:ring-primary outline-none font-mono" placeholder="-NP" /></div>
                <div>
                  <Label className="text-foreground">Start Number From</Label>
                  <p className="text-xs text-muted-foreground mb-1">The next invoice will use this number</p>
                  <Input type="number" min={1} value={settings.invoice_next_number || 1} onChange={e => set('invoice_next_number', Number(e.target.value))} className="mt-1 h-10 border border-border bg-background px-3 text-sm rounded-md focus:ring-1 focus:ring-primary outline-none font-mono text-right" />
                </div>
              </div>
              <div className="mt-4">
                <ToggleRow label="Include Fiscal Year Tag" desc="Automatically inject the active Fiscal Year identifier (e.g. FY26) in the middle of the document number." checked={settings.include_fy_in_invoice_number} onChange={v => set('include_fy_in_invoice_number', v)} />
              </div>
              <div className="mt-4 bg-muted/40 rounded-lg px-4 py-3 text-xs font-mono text-muted-foreground">
                Example: {settings.invoice_prefix_sales || 'SI'}-{settings.include_fy_in_invoice_number ? '[Active FY]-' : ''}{String(settings.invoice_next_number || 1).padStart(5,'0')}{settings.invoice_suffix || ''}
              </div>
            </SectionCard>

            <SectionCard title="Invoice Template Design" icon={FileText}>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Choose the print template style for your documents.</p>
                {['Sales Invoice', 'Purchase Order', 'Sales Order'].map(t => (
                  <div key={t} className="flex items-center justify-between py-2.5 border-b border-border last:border-0 text-foreground">
                    <span className="text-sm font-medium">{t}</span>
                    <Select defaultValue="standard">
                      <SelectTrigger className="w-44 h-8 text-xs border border-border bg-background"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="standard">Standard (Classic)</SelectItem>
                        <SelectItem value="modern">Modern (Compact)</SelectItem>
                        <SelectItem value="detailed">Detailed (With Notes)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </SectionCard>
            
            <SectionCard title="Trading History" icon={FileText}>
              <ToggleRow 
                label="Allow Display of Transaction History While Making Purchase/Sales Transactions" 
                desc="When active, users can choose to view recent transactions for an item during invoice creation." 
                checked={settings.show_recent_trading_history} 
                onChange={v => set('show_recent_trading_history', v)} 
              />
            </SectionCard>

            <QuotationSettings settings={settings} onChange={(key, val) => set(key, val)} />
          </>
        )}

        {/* ── HUB 4: DATA LOGISTICS ── */}
        {activeHub === 'logistics' && (
          <>
            <SectionCard title="System Cut-Over (Opening Balances)" icon={Database}>
              <div className="space-y-3 mb-6">
                <p className="text-sm text-muted-foreground">Set the cut-over date for opening balances. Inventory and ledger balances entered before this date are treated as opening entries.</p>
                <div className="max-w-xs">
                  <DateInput label="Opening Balance Date" value={settings.opening_balance_date || ''} onChange={v => set('opening_balance_date', v)} />
                </div>
              </div>
              <OpeningBalances />
            </SectionCard>
            <ItemImportExport />
            <DataUtilities />
          </>
        )}

        {/* ── HUB 5: APP & INTEGRATIONS ── */}
        {activeHub === 'integrations' && (
          <>
            <SectionCard title="Feature Toggles" icon={Settings2}>
              <ToggleRow label="POS Module" desc="Point of Sale terminal" checked={settings.enable_pos_module} onChange={v => set('enable_pos_module', v)} />
              <ToggleRow label="Purchase Orders" desc="Full PO workflow before invoicing" checked={settings.enable_purchase_orders} onChange={v => set('enable_purchase_orders', v)} />
              <ToggleRow label="Landed Costs" desc="Add freight/customs to inventory WAC" checked={settings.enable_landed_costs} onChange={v => set('enable_landed_costs', v)} />
              <ToggleRow label="Manufacturing Module" desc="Production orders and BOM" checked={settings.enable_manufacturing_module} onChange={v => set('enable_manufacturing_module', v)} />
              <ToggleRow label="HR & Payroll Module" desc="Employees, leave, and payroll" checked={settings.enable_hr_module} onChange={v => set('enable_hr_module', v)} />
              <ToggleRow label="Fixed Assets Module" desc="Asset register and depreciation" checked={settings.enable_assets_module} onChange={v => set('enable_assets_module', v)} />
              <ToggleRow label="Services Module" desc="Service contracts and recurring billing" checked={settings.enable_services_module} onChange={v => set('enable_services_module', v)} />
            </SectionCard>

            <SectionCard title="Regional Settings" icon={Globe}>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-foreground">Default Date Format</Label>
                  <p className="text-xs text-muted-foreground mb-1">This sets the default calendar mode across the app</p>
                  <Select value={settings.date_format || 'AD'} onValueChange={v => set('date_format', v)}>
                    <SelectTrigger className="h-10 border border-border bg-background px-3 text-sm rounded-md focus:ring-1 focus:ring-primary outline-none"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AD">AD — English (Gregorian)</SelectItem>
                      <SelectItem value="BS">BS — Nepali (Bikram Sambat)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Storage & Media Limits" icon={Palette}>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-foreground">Max Image Size (MB per image)</Label>
                  <Input type="number" min={0.5} max={20} step={0.5} value={settings.item_image_max_size_mb || 2} onChange={e => set('item_image_max_size_mb', Number(e.target.value))} className="mt-1 h-10 border border-border bg-background px-3 text-sm rounded-md focus:ring-1 focus:ring-primary outline-none font-mono text-right" />
                </div>
                <div>
                  <Label className="text-foreground">Max Number of Images per Item</Label>
                  <Input type="number" min={1} max={10} value={settings.item_image_max_count || 3} onChange={e => set('item_image_max_count', Number(e.target.value))} className="mt-1 h-10 border border-border bg-background px-3 text-sm rounded-md focus:ring-1 focus:ring-primary outline-none font-mono text-right" />
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Communication Channels (SMTP)" icon={Mail}>
              <CommunicationSettings companyId={settings.company_id} />
            </SectionCard>
          </>
        )}

      </div>
    </div>
  );
}