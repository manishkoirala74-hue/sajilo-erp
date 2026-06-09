import { useState, useEffect } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { toast } from 'sonner';
import { Plus, Eye, Trash2, RotateCcw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import SearchableSelect from '@/components/shared/SearchableSelect';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import { useSajiloSync } from '@/hooks/useSajiloSync';
const emptyVoucher = {
  voucher_type: 'Receipt', voucher_date: new Date().toISOString().split('T')[0],
  contact_name: '', payment_mode: 'Cash', reference_no: '', narration: '',
  total_amount: 0, status: 'Draft',
  entries: [{ account_name: '', account_code: '', account_type: 'Asset', debit: 0, credit: 0, narration: '' }]
};

const fmt = (n) => `NPR ${Number(n || 0).toLocaleString()}`;

export default function FinancialVouchers() {
  const [vouchers, setVouchers] = useState([]);
  const [allAccounts, setAllAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(emptyVoucher);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('All');

  // Delete / Reverse dialog state
  const [actionDialog, setActionDialog] = useState(null); // null | 'delete' | 'reverse'
  const [actionReason, setActionReason] = useState('');
  const [actionProcessing, setActionProcessing] = useState(false);

  useEffect(() => { fetchData(); }, []);
  useSajiloSync(['ChartOfAccount'], fetchData);

  async function fetchData() {
    setLoading(true);
    const [data, accounts] = await Promise.all([
      sajilo.entities.FinancialVoucher.list('-created_date', 200),
      sajilo.entities.ChartOfAccount.filter({ is_active: true }, 'account_code', 1000),
    ]);
    setVouchers(data);
    setAllAccounts(accounts);
    setLoading(false);
  };

  const cashAccounts = allAccounts.filter(a =>
    a.ledger_type === 'Sub Ledger' &&
    a.account_type === 'Asset' &&
    (
      (a.account_subtype || '').toLowerCase().includes('cash') ||
      (a.account_name || '').toLowerCase().includes('cash') ||
      (a.account_name || '').toLowerCase().includes('bank') ||
      (a.account_name || '').toLowerCase().includes('petty')
    )
  );

  const isPaymentType = form.voucher_type === 'Payment' || form.voucher_type === 'Receipt' || form.voucher_type === 'Contra';
  const paymentSourceAccounts = isPaymentType ? cashAccounts : allAccounts.filter(a => a.ledger_type === 'Sub Ledger');
  const ledgerAccounts = allAccounts.filter(a => a.ledger_type === 'Sub Ledger');

  const handleEntry = (idx, field, val) => {
    setForm(prev => {
      const entries = [...prev.entries];
      entries[idx] = { ...entries[idx], [field]: (field === 'debit' || field === 'credit') ? parseFloat(val) || 0 : val };
      const total = entries.reduce((s, e) => s + (e.debit || 0), 0);
      return { ...prev, entries, total_amount: total };
    });
  };

  const addEntry = () => setForm({ ...form, entries: [...form.entries, { account_id: '', account_code: '', account_name: '', account_type: 'Asset', debit: 0, credit: 0, narration: '' }] });
  const removeEntry = (idx) => setForm({ ...form, entries: form.entries.filter((_, i) => i !== idx) });

  const genNumber = () => {
    const prefix = { Receipt: 'RV', Payment: 'PV', Journal: 'JV', Contra: 'CV' }[form.voucher_type] || 'VV';
    return `${prefix}-${new Date().getFullYear()}-${String(vouchers.length + 1).padStart(3, '0')}`;
  };

  // ── Post new GL journal ───────────────────────────────────────────────────
  async function postGLLines(voucher) {
    const lines = (voucher.entries || [])
      .filter(e => e.account_id)
      .map(e => ({
        account_id: e.account_id,
        account_code: e.account_code || '',
        account_name: e.account_name || '',
        account_type: e.account_type || '',
        debit_amount: e.debit || 0,
        credit_amount: e.credit || 0,
        description: voucher.narration || e.narration || `Financial Voucher ${voucher.voucher_number}`,
      }));

    if (lines.length === 0) return;

    const today = voucher.voucher_date || new Date().toISOString().split('T')[0];
    const totalDebit = lines.reduce((s, l) => s + (l.debit_amount || 0), 0);
    const totalCredit = lines.reduce((s, l) => s + (l.credit_amount || 0), 0);

    const journal = await sajilo.entities.GeneralLedgerJournal.create({
      entry_date: today,
      description: voucher.narration || `Financial Voucher ${voucher.voucher_number}`,
      reference_module: 'Treasury',
      source_document_id: voucher.id,
      source_document_type: 'FinancialVoucher',
      status: 'Posted',
      total_debit: totalDebit,
      total_credit: totalCredit,
      is_balanced: Math.abs(totalDebit - totalCredit) < 0.01,
    });

    await sajilo.entities.GeneralLedgerLine.bulkCreate(
      lines.map(l => ({ ...l, journal_id: journal.id }))
    );

    for (const l of lines) {
      if (!l.account_id) continue;
      const results = await sajilo.entities.ChartOfAccount.filter({ id: l.account_id }, 'account_code', 1);
      const acc = results[0];
      if (!acc) continue;
      const delta = (l.debit_amount || 0) - (l.credit_amount || 0);
      const debitNormal = ['Asset', 'COGS', 'Expense', 'OPEX', 'Cost of Goods Sold', 'Other Expense'].includes(acc.account_type);
      const balanceChange = debitNormal ? delta : -delta;
      await sajilo.entities.ChartOfAccount.update(acc.id, { current_balance: Math.round(((acc.current_balance || 0) + balanceChange) * 100) / 100 });
    }
  }

  const save = async (status) => {
    setSaving(true);
    try {
      const payload = { ...form, status, voucher_number: genNumber() };
      const savedVoucher = await sajilo.entities.FinancialVoucher.create(payload);
      
      if (status === 'Posted') {
        await postGLLines(savedVoucher);
      }

      toast.success(`Voucher ${status}`);
      setOpen(false);
      setForm(emptyVoucher);
      fetchData();
    } catch (err) {
      toast.error(err.message || 'Error occurred while saving');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete voucher ────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!selected) return;
    setActionProcessing(true);
    const user = await sajilo.auth.me();

    // Reverse GL lines first if voucher is Posted
    if (selected.status === 'Posted') {
      await reverseGLLines(selected, user, 'Delete');
    }

    // Log the deletion
    await sajilo.entities.FinancialVoucherDeleteLog.create({
      voucher_id: selected.id,
      voucher_number: selected.voucher_number,
      voucher_type: selected.voucher_type,
      voucher_date: selected.voucher_date,
      total_amount: selected.total_amount || 0,
      contact_name: selected.contact_name || '',
      action_type: 'Delete',
      performed_by: user?.email || 'unknown',
      reason: actionReason || 'Manual deletion',
      voucher_snapshot: selected,
    });

    await sajilo.entities.FinancialVoucher.delete(selected.id);
    toast.success(`Voucher ${selected.voucher_number} deleted and logged`);
    setActionDialog(null);
    setViewOpen(false);
    setSelected(null);
    setActionReason('');
    setActionProcessing(false);
    fetchData();
  };

  // ── Reverse voucher ───────────────────────────────────────────────────────
  const handleReverse = async () => {
    if (!selected) return;
    setActionProcessing(true);
    const user = await sajilo.auth.me();

    // Build reversal voucher with flipped debit/credit
    const reversalEntries = (selected.entries || []).map(e => ({
      ...e,
      debit: e.credit || 0,
      credit: e.debit || 0,
    }));

    const revPrefix = { Receipt: 'RV', Payment: 'PV', Journal: 'JV', Contra: 'CV' }[selected.voucher_type] || 'VV';
    const reversalNumber = `REV-${selected.voucher_number}`;
    const today = new Date().toISOString().split('T')[0];

    const reversalVoucher = await sajilo.entities.FinancialVoucher.create({
      voucher_type: selected.voucher_type,
      voucher_date: today,
      voucher_number: reversalNumber,
      contact_name: selected.contact_name || '',
      payment_mode: selected.payment_mode || 'Cash',
      reference_no: `REV-${selected.reference_no || selected.voucher_number}`,
      narration: `Reversal of ${selected.voucher_number}. ${actionReason || ''}`.trim(),
      total_amount: selected.total_amount || 0,
      status: 'Posted',
      entries: reversalEntries,
    });

    // Post the reversal GL lines
    await reverseGLLines(selected, user, 'Reverse');

    // Mark original as Cancelled
    await sajilo.entities.FinancialVoucher.update(selected.id, { status: 'Cancelled' });

    // Log the reversal
    await sajilo.entities.FinancialVoucherDeleteLog.create({
      voucher_id: selected.id,
      voucher_number: selected.voucher_number,
      voucher_type: selected.voucher_type,
      voucher_date: selected.voucher_date,
      total_amount: selected.total_amount || 0,
      contact_name: selected.contact_name || '',
      action_type: 'Reverse',
      reversal_voucher_number: reversalNumber,
      performed_by: user?.email || 'unknown',
      reason: actionReason || 'Manual reversal',
      voucher_snapshot: selected,
    });

    toast.success(`Voucher ${selected.voucher_number} reversed. Reversal entry: ${reversalNumber}`);
    setActionDialog(null);
    setViewOpen(false);
    setSelected(null);
    setActionReason('');
    setActionProcessing(false);
    fetchData();
  };

  // ── Post reversal GL journal ──────────────────────────────────────────────
  async function reverseGLLines(voucher, user, actionType) {
    const lines = (voucher.entries || [])
      .filter(e => e.account_id)
      .map(e => ({
        account_id: e.account_id,
        account_code: e.account_code || '',
        account_name: e.account_name || '',
        account_type: e.account_type || '',
        debit_amount: e.credit || 0,   // flip
        credit_amount: e.debit || 0,   // flip
        description: `${actionType} of voucher ${voucher.voucher_number}`,
      }));

    if (lines.length === 0) return;

    const today = new Date().toISOString().split('T')[0];
    const totalDebit = lines.reduce((s, l) => s + (l.debit_amount || 0), 0);
    const totalCredit = lines.reduce((s, l) => s + (l.credit_amount || 0), 0);

    const journal = await sajilo.entities.GeneralLedgerJournal.create({
      entry_date: today,
      description: `${actionType} of Financial Voucher ${voucher.voucher_number}`,
      reference_module: 'Treasury',
      source_document_id: voucher.id,
      source_document_type: 'FinancialVoucher',
      status: 'Posted',
      total_debit: totalDebit,
      total_credit: totalCredit,
      is_balanced: Math.abs(totalDebit - totalCredit) < 0.01,
    });

    await sajilo.entities.GeneralLedgerLine.bulkCreate(
      lines.map(l => ({ ...l, journal_id: journal.id }))
    );

    // Update ChartOfAccount balances
    for (const l of lines) {
      if (!l.account_id) continue;
      const results = await sajilo.entities.ChartOfAccount.filter({ id: l.account_id }, 'account_code', 1);
      const acc = results[0];
      if (!acc) continue;
      const delta = (l.debit_amount || 0) - (l.credit_amount || 0);
      const debitNormal = ['Asset', 'COGS', 'Expense', 'OPEX', 'Cost of Goods Sold', 'Other Expense'].includes(acc.account_type);
      const balanceChange = debitNormal ? delta : -delta;
      await sajilo.entities.ChartOfAccount.update(acc.id, { current_balance: Math.round(((acc.current_balance || 0) + balanceChange) * 100) / 100 });
    }
  }

  const filtered = filter === 'All' ? vouchers : vouchers.filter(v => v.voucher_type === filter || v.status === filter);

  const columns = [
    { key: 'voucher_number', label: 'Voucher #' },
    { key: 'voucher_type', label: 'Type', render: v => <StatusBadge status={v} /> },
    { key: 'voucher_date', label: 'Date', isDate: true },
    { key: 'contact_name', label: 'Contact' },
    { key: 'payment_mode', label: 'Mode' },
    { key: 'total_amount', label: 'Amount', render: v => fmt(v) },
    { key: 'status', label: 'Status', render: v => <StatusBadge status={v} /> },
    { key: 'id', label: '', render: (_, row) => (
      <Button size="sm" variant="ghost" onClick={() => { setSelected(row); setViewOpen(true); }}>
        <Eye className="w-4 h-4" />
      </Button>
    )}
  ];

  return (
    <div>
      <PageHeader
        title="Financial Vouchers"
        subtitle="Receipt, Payment, Journal & Contra entries"
        action={() => { setForm(emptyVoucher); setOpen(true); }}
        actionLabel="New Voucher"
        actionIcon={Plus}
      />

      <div className="flex gap-2 mb-4 flex-wrap">
        {['All', 'Receipt', 'Payment', 'Journal', 'Contra', 'Draft', 'Posted'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filter === f ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
            {f}
          </button>
        ))}
      </div>

      <DataTable columns={columns} data={filtered} searchKey="contact_name" loading={loading} />

      {/* Create Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Financial Voucher</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Voucher Type</Label>
                <SearchableSelect
                  value={form.voucher_type}
                  onValueChange={v => setForm({ ...form, voucher_type: v })}
                  options={['Receipt', 'Payment', 'Journal', 'Contra'].map(t => ({ value: t, label: t }))}
                />
              </div>
              <div>
                <Label>Date</Label>
                <Input type="date" value={form.voucher_date} onChange={e => setForm({ ...form, voucher_date: e.target.value })} />
              </div>
              <div>
                <Label>Contact Name</Label>
                <Input value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} />
              </div>
              <div>
                <Label>Payment Mode</Label>
                <SearchableSelect
                  value={form.payment_mode}
                  onValueChange={v => setForm({ ...form, payment_mode: v })}
                  options={['Cash', 'Bank Transfer', 'Cheque', 'Digital Wallet'].map(m => ({ value: m, label: m }))}
                />
              </div>
              <div>
                <Label>Reference No</Label>
                <Input value={form.reference_no} onChange={e => setForm({ ...form, reference_no: e.target.value })} />
              </div>
              <div>
                <Label>Narration</Label>
                <Input value={form.narration} onChange={e => setForm({ ...form, narration: e.target.value })} />
              </div>
            </div>

            {/* Entries */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Ledger Entries</Label>
                <Button size="sm" variant="outline" onClick={addEntry}>+ Add Row</Button>
              </div>
              {isPaymentType && cashAccounts.length > 0 && (
                <p className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded px-3 py-1.5 mb-2">
                  Row 1 (payment source) is restricted to <strong>Cash & Cash Equivalents</strong> accounts only.
                </p>
              )}
              <div className="border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Account</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Debit</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Credit</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {form.entries.map((e, idx) => {
                      const accountOptions = idx === 0 && isPaymentType ? paymentSourceAccounts : ledgerAccounts;
                      return (
                        <tr key={idx}>
                          <td className="px-2 py-1">
                            <SearchableSelect
                                value={e.account_id || ''}
                                onValueChange={v => {
                                  const acc = allAccounts.find(a => a.id === v);
                                  handleEntry(idx, 'account_id', v);
                                  handleEntry(idx, 'account_code', acc?.account_code || '');
                                  handleEntry(idx, 'account_name', acc?.account_name || '');
                                  handleEntry(idx, 'account_type', acc?.account_type || '');
                                }}
                                placeholder="Select account…"
                                options={accountOptions.map(a => ({ value: a.id, label: a.account_name, sub: a.account_code }))}
                              />
                          </td>
                          <td className="px-2 py-1 w-28"><Input type="number" value={e.debit} onChange={ev => handleEntry(idx, 'debit', ev.target.value)} className="h-8" /></td>
                          <td className="px-2 py-1 w-28"><Input type="number" value={e.credit} onChange={ev => handleEntry(idx, 'credit', ev.target.value)} className="h-8" /></td>
                          <td className="px-2 py-1"><button onClick={() => removeEntry(idx)} className="text-red-500 hover:text-red-700 px-2">×</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end mt-2 text-sm font-semibold text-foreground">
                Total Debit: {fmt(form.total_amount)}
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button variant="outline" onClick={() => save('Draft')} disabled={saving}>Save Draft</Button>
              <Button onClick={() => save('Posted')} disabled={saving}>Post Voucher</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={viewOpen} onOpenChange={v => { if (!v) { setViewOpen(false); setSelected(null); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Voucher — {selected?.voucher_number}</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4 text-sm">
              <div id="voucher-content" className="space-y-4 p-4 bg-white">
                <div className="text-center border-b pb-4 mb-4">
                  <h2 className="text-lg font-bold uppercase">{selected.voucher_type} VOUCHER</h2>
                  <p className="text-sm text-muted-foreground">{selected.voucher_number}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><span className="text-muted-foreground">Type:</span> <strong>{selected.voucher_type}</strong></div>
                  <div><span className="text-muted-foreground">Date:</span> <strong>{selected.voucher_date}</strong></div>
                  <div><span className="text-muted-foreground">Contact:</span> <strong>{selected.contact_name || '—'}</strong></div>
                  <div><span className="text-muted-foreground">Mode:</span> <strong>{selected.payment_mode}</strong></div>
                  <div><span className="text-muted-foreground">Ref No:</span> <strong>{selected.reference_no || '—'}</strong></div>
                  <div><span className="text-muted-foreground">Status:</span> <strong>{selected.status}</strong></div>
                </div>
                <div>
                  <p className="font-medium mb-2">Ledger Entries</p>
                  <table className="w-full border rounded-lg overflow-hidden text-xs">
                    <thead className="bg-muted/50"><tr>
                      <th className="px-3 py-2 text-left">Account</th>
                      <th className="px-3 py-2 text-left">Type</th>
                      <th className="px-3 py-2 text-right">Debit</th>
                      <th className="px-3 py-2 text-right">Credit</th>
                    </tr></thead>
                    <tbody className="divide-y divide-border">
                      {(selected.entries || []).map((e, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2">{e.account_name}</td>
                          <td className="px-3 py-2">{e.account_type}</td>
                          <td className="px-3 py-2 text-right">{fmt(e.debit)}</td>
                          <td className="px-3 py-2 text-right">{fmt(e.credit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="text-right font-semibold">Total: {fmt(selected.total_amount)}</div>
              </div>

              {/* Action buttons — only for non-cancelled vouchers */}
              <div className="flex justify-between items-center pt-2 border-t border-border">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    import('html2canvas').then(({ default: html2canvas }) => {
                      import('jspdf').then(({ jsPDF }) => {
                        const el = document.getElementById('voucher-content');
                        if (!el) return;
                        html2canvas(el, { scale: 2 }).then((canvas) => {
                          const imgData = canvas.toDataURL('image/png');
                          const pdf = new jsPDF('p', 'mm', 'a4');
                          const pdfWidth = pdf.internal.pageSize.getWidth();
                          const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
                          pdf.addImage(imgData, 'PNG', 0, 10, pdfWidth, pdfHeight);
                          pdf.save(`Voucher_${selected.voucher_number}.pdf`);
                        });
                      });
                    });
                  }}
                >
                  Download PDF
                </Button>
                {selected.status !== 'Cancelled' && (
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-amber-600 border-amber-300 hover:bg-amber-50"
                      onClick={() => { setActionReason(''); setActionDialog('reverse'); }}
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Reverse Voucher
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-red-600 border-red-300 hover:bg-red-50"
                      onClick={() => { setActionReason(''); setActionDialog('delete'); }}
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete Voucher
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete / Reverse Confirmation Dialog */}
      <Dialog open={!!actionDialog} onOpenChange={v => { if (!v) setActionDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className={`flex items-center gap-2 ${actionDialog === 'delete' ? 'text-red-600' : 'text-amber-600'}`}>
              {actionDialog === 'delete' ? <Trash2 className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
              {actionDialog === 'delete' ? 'Delete Voucher' : 'Reverse Voucher'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className={`flex items-start gap-2 rounded-lg p-3 border ${actionDialog === 'delete' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
              <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${actionDialog === 'delete' ? 'text-red-500' : 'text-amber-500'}`} />
              <div className="text-sm">
                {actionDialog === 'delete' ? (
                  <p className="font-medium text-red-800">
                    This will permanently delete <strong>{selected?.voucher_number}</strong> and reverse any GL postings. This action cannot be undone.
                  </p>
                ) : (
                  <p className="font-medium text-amber-800">
                    This will create a <strong>reversal entry</strong> (REV-{selected?.voucher_number}) with opposite debit/credit lines, and mark the original as Cancelled.
                  </p>
                )}
              </div>
            </div>

            <div>
              <Label>Reason <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                className="mt-1"
                value={actionReason}
                onChange={e => setActionReason(e.target.value)}
                placeholder={actionDialog === 'delete' ? 'Reason for deletion…' : 'Reason for reversal…'}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setActionDialog(null)} disabled={actionProcessing}>Cancel</Button>
              <Button
                variant={actionDialog === 'delete' ? 'destructive' : 'default'}
                className={actionDialog === 'reverse' ? 'bg-amber-600 hover:bg-amber-700 text-white' : ''}
                onClick={actionDialog === 'delete' ? handleDelete : handleReverse}
                disabled={actionProcessing}
              >
                {actionProcessing
                  ? (actionDialog === 'delete' ? 'Deleting…' : 'Reversing…')
                  : (actionDialog === 'delete' ? 'Confirm Delete' : 'Confirm Reverse')
                }
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}