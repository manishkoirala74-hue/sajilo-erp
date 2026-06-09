import { useState, useEffect } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { X, Landmark, Banknote, Upload, FileText, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

const ACCOUNT_TYPES = ['Cash', 'Bank'];
const CATEGORIES = {
  Cash: ['Cash in Hand'],
  Bank: ['Current', 'Savings', 'Overdraft', 'Fixed Deposit'],
};

export default function BankAccountFormModal({ account, onSave, onClose }) {
  const [form, setForm] = useState({
    account_name: '',
    account_type: 'Bank',
    account_holder_name: '',
    bank_name: '',
    branch_name: '',
    account_number: '',
    account_category: 'Current',
    currency: 'NPR',
    opening_balance: 0,
    current_balance: 0,
    gl_account_id: '',
    gl_account_name: '',
    ledger_group_id: '',
    ledger_group_name: '',
    ifsc_code: '',
    swift_code: '',
    contact_person: '',
    contact_phone: '',
    notes: '',
    document_urls: [],
    is_active: true,
  });

  const [ledgerGroups, setLedgerGroups] = useState([]);
  const [allAccounts, setAllAccounts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (account) setForm(prev => ({ ...prev, ...account, document_urls: account.document_urls || [] }));
    sajilo.entities.ChartOfAccount.list('account_code', 500).then(accs => {
      setAllAccounts(accs);
      const groups = accs.filter(a =>
        a.ledger_type === 'Group Ledger' &&
        a.is_active !== false &&
        (
          a.account_subtype?.toLowerCase().includes('cash') ||
          a.account_name?.toLowerCase().includes('cash') ||
          a.account_subtype?.toLowerCase().includes('current asset') ||
          a.account_type === 'Asset'
        )
      );
      setLedgerGroups(groups);
    });
  }, []);

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const handleTypeChange = (t) => {
    const defaultCat = t === 'Cash' ? 'Cash in Hand' : 'Current';
    setForm(prev => ({ ...prev, account_type: t, account_category: defaultCat }));
  };

  const handleLedgerGroupSelect = (id) => {
    const grp = ledgerGroups.find(a => a.id === id);
    setForm(prev => ({ ...prev, ledger_group_id: id, ledger_group_name: grp?.account_name || '' }));
  };

  const generateAccountCode = (parentCode, siblingAccounts) => {
    const siblings = siblingAccounts.filter(a =>
      a.parent_account_id === form.ledger_group_id && a.ledger_type === 'Sub Ledger'
    );
    const codes = siblings.map(a => parseInt(a.account_code)).filter(n => !isNaN(n));
    const maxCode = codes.length > 0 ? Math.max(...codes) : parseInt(parentCode + '00');
    return String(maxCode + 1);
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    const newUrls = [];
    for (const file of files) {
      const { file_url } = await sajilo.integrations.Core.UploadFile({ file });
      newUrls.push(file_url);
    }
    setForm(prev => ({ ...prev, document_urls: [...(prev.document_urls || []), ...newUrls] }));
    setUploading(false);
    e.target.value = '';
  };

  const removeDocument = (idx) => {
    setForm(prev => ({ ...prev, document_urls: prev.document_urls.filter((_, i) => i !== idx) }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.account_name.trim()) { toast.error('Account name is required'); return; }
    
    setSaving(true);
    try {
      if (!account) {
        if (!form.ledger_group_id) { toast.error('Please select a Ledger Group'); return; }

      const existing = allAccounts.find(a =>
        a.account_name?.toLowerCase() === form.account_name.trim().toLowerCase()
      );
      if (existing) {
        toast.error(`A GL account named "${form.account_name.trim()}" already exists.`);
        return;
      }

      const existingBank = await sajilo.entities.BankAccount.filter({ account_name: form.account_name.trim() });
      if (existingBank.length > 0) {
        toast.error(`A bank account named "${form.account_name.trim()}" already exists.`);
        return;
      }

      const parentGroup = ledgerGroups.find(g => g.id === form.ledger_group_id);
      const newCode = generateAccountCode(parentGroup?.account_code || '1100', allAccounts);

      const newGLAccount = await sajilo.entities.ChartOfAccount.create({
        account_code: newCode,
        account_name: form.account_name.trim(),
        account_type: 'Asset',
        account_subtype: 'Current Asset',
        ledger_type: 'Sub Ledger',
        parent_account_id: form.ledger_group_id,
        parent_account_name: form.ledger_group_name,
        normal_balance: 'Debit',
        current_balance: form.opening_balance || 0,
        is_active: true,
        is_system_account: false,
        description: `Auto-created for ${form.account_type} account: ${form.account_name.trim()}`,
      });

      await onSave({ ...form, gl_account_id: newGLAccount.id, gl_account_name: newGLAccount.account_name });
    } else {
      await onSave(form);
    }
  } catch (err) {
    toast.error(err.message || 'Error occurred while saving');
  } finally {
    setSaving(false);
  }
};

  const isBank = form.account_type === 'Bank';
  const isEdit = !!account;

  const getFileName = (url) => {
    try { return decodeURIComponent(url.split('/').pop().split('?')[0]); } catch { return 'Document'; }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            {isBank ? <Landmark className="w-5 h-5 text-primary" /> : <Banknote className="w-5 h-5 text-emerald-600" />}
            <h2 className="text-base font-semibold">{isEdit ? 'Edit Account' : `New ${isBank ? 'Bank' : 'Cash'} Account`}</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {/* Account Type + Ledger Group */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Account Type *</Label>
              <Select value={form.account_type} onValueChange={handleTypeChange} disabled={isEdit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ledger Group {!isEdit && '*'}</Label>
              {isEdit ? (
                <Input value={form.ledger_group_name || '—'} disabled className="bg-muted/30" />
              ) : (
                <Select value={form.ledger_group_id || ''} onValueChange={handleLedgerGroupSelect}>
                  <SelectTrigger><SelectValue placeholder="Select ledger group…" /></SelectTrigger>
                  <SelectContent>
                    {ledgerGroups.length === 0 && <SelectItem value="__none__" disabled>No group ledgers found</SelectItem>}
                    {ledgerGroups.map(g => (
                      <SelectItem key={g.id} value={g.id}>{g.account_code} — {g.account_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {/* Account Name + Category (Bank only) */}
          <div className={`grid gap-4 ${isBank ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <div className="space-y-1.5">
              <Label>Account / Ledger Name *</Label>
              <Input required value={form.account_name} onChange={e => set('account_name', e.target.value)}
                placeholder={isBank ? 'e.g. Nepal Bank - Current A/C' : 'e.g. Petty Cash'} />
            </div>
            {isBank && (
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={form.account_category} onValueChange={v => set('account_category', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.Bank.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Bank-specific fields */}
          {isBank && (
            <>
              <div className="space-y-1.5">
                <Label>Signature Holder's Name</Label>
                <Input value={form.account_holder_name} onChange={e => set('account_holder_name', e.target.value)}
                  placeholder="Name of the authorised signatory" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Branch Name</Label>
                  <Input value={form.branch_name} onChange={e => set('branch_name', e.target.value)}
                    placeholder="e.g. Newroad Branch" />
                </div>
                <div className="space-y-1.5">
                  <Label>Account Number</Label>
                  <Input value={form.account_number} onChange={e => set('account_number', e.target.value)}
                    placeholder="Bank account number" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Currency</Label>
                  <Input value={form.currency} onChange={e => set('currency', e.target.value)} placeholder="NPR" />
                </div>
                <div className="space-y-1.5">
                  <Label>IFSC / Routing Code</Label>
                  <Input value={form.ifsc_code} onChange={e => set('ifsc_code', e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>SWIFT Code</Label>
                <Input value={form.swift_code} onChange={e => set('swift_code', e.target.value)} />
              </div>
              {/* Contact for Bank only */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Contact Person</Label>
                  <Input value={form.contact_person} onChange={e => set('contact_person', e.target.value)}
                    placeholder="Bank relationship manager" />
                </div>
                <div className="space-y-1.5">
                  <Label>Contact Phone</Label>
                  <Input value={form.contact_phone} onChange={e => set('contact_phone', e.target.value)} />
                </div>
              </div>
            </>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              rows={2} placeholder="Additional information…"
              className="w-full text-sm border border-input rounded-md px-3 py-2 bg-transparent focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
          </div>

          {/* Document Upload */}
          <div className="space-y-2">
            <Label>Supporting Documents</Label>
            <label className={`flex items-center gap-2 w-fit cursor-pointer px-3 py-2 text-sm border border-dashed border-border rounded-lg hover:bg-muted/30 transition-colors ${uploading ? 'opacity-60 pointer-events-none' : ''}`}>
              <Upload className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">{uploading ? 'Uploading…' : 'Upload documents'}</span>
              <input type="file" multiple className="hidden" onChange={handleFileUpload} accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xlsx,.csv" />
            </label>
            {(form.document_urls || []).length > 0 && (
              <div className="space-y-1.5 mt-2">
                {form.document_urls.map((url, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs bg-muted/30 rounded-lg px-3 py-1.5">
                    <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate flex-1">{getFileName(url)}</a>
                    <button type="button" onClick={() => removeDocument(i)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Active Toggle */}
          <div className="flex items-center gap-3">
            <Switch checked={form.is_active} onCheckedChange={v => set('is_active', v)} />
            <Label>Account is Active</Label>
          </div>
        </form>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-border shrink-0">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving || uploading}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Account'}
          </Button>
        </div>
      </div>
    </div>
  );
}