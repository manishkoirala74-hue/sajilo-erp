import { useState, useEffect } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertCircle, Layers, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

const MODULE_COLORS = {
  Manufacturing: 'bg-orange-100 text-orange-700',
  Payroll: 'bg-purple-100 text-purple-700',
  Assets: 'bg-blue-100 text-blue-700',
  General: 'bg-slate-100 text-slate-700',
  Sales: 'bg-emerald-100 text-emerald-700',
  Purchase: 'bg-amber-100 text-amber-700',
  Stock: 'bg-cyan-100 text-cyan-700',
};

const STATUS_COLORS = {
  Posted: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  Draft: 'bg-amber-100 text-amber-700 border-amber-200',
  Reversed: 'bg-red-100 text-red-700 border-red-200',
};

export default function JournalDetailDrawer({ journal, open, onClose, onRefresh }) {
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [reversing, setReversing] = useState(false);
  const [showReverseDialog, setShowReverseDialog] = useState(false);
  const [reverseDate, setReverseDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    if (journal && open) {
      setLoading(true);
      sajilo.entities.GeneralLedgerLine.filter({ journal_id: journal.id }).then(data => {
        setLines(data);
        setLoading(false);
      });
    }
  }, [journal, open]);

  if (!journal) return null;

  const totalDebit = lines.reduce((s, l) => s + (l.debit_amount || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (l.credit_amount || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.001;

  const handleReverse = async () => {
    setReversing(true);
    try {
      const revJournal = await sajilo.entities.GeneralLedgerJournal.create({
        entry_date: reverseDate,
        description: `Reversal of: ${journal.description}`,
        reference_module: journal.reference_module,
        source_document_id: journal.id,
        source_document_type: 'Reversal',
        status: 'Posted',
        total_debit: totalCredit, 
        total_credit: totalDebit, 
        is_balanced: isBalanced,
        notes: `Reversing journal ID: ${journal.id}`,
      });

      const revLines = lines.map(l => ({
        journal_id: revJournal.id,
        account_id: l.account_id,
        account_code: l.account_code,
        account_name: l.account_name,
        account_type: l.account_type,
        debit_amount: l.credit_amount || 0,
        credit_amount: l.debit_amount || 0,
        description: `Reversal: ${l.description || ''}`,
      }));

      await sajilo.entities.GeneralLedgerLine.bulkCreate(revLines);

      for (const l of revLines) {
        if (!l.account_id) continue;
        const results = await sajilo.entities.ChartOfAccount.filter({ id: l.account_id }, 'account_code', 1);
        const acc = results[0];
        if (!acc) continue;
        const delta = (l.debit_amount || 0) - (l.credit_amount || 0);
        const debitNormal = ['Asset', 'COGS', 'Expense', 'OPEX', 'Cost of Goods Sold', 'Other Expense'].includes(acc.account_type);
        const balanceChange = debitNormal ? delta : -delta;
        await sajilo.entities.ChartOfAccount.update(acc.id, { current_balance: Math.round(((acc.current_balance || 0) + balanceChange) * 100) / 100 });
      }

      await sajilo.entities.GeneralLedgerJournal.update(journal.id, { status: 'Reversed' });
      const { toast } = await import('sonner');
      toast.success("Journal reversed successfully");
      setShowReverseDialog(false);
      onClose();
      if (onRefresh) onRefresh();
    } catch (err) {
      const { toast } = await import('sonner');
      toast.error("Failed to reverse journal: " + err.message);
    } finally {
      setReversing(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-primary" /> Journal Entry Detail
          </SheetTitle>
        </SheetHeader>

        <div className="mt-5 space-y-5">
          {/* Header info */}
          <div className="bg-muted/30 rounded-xl p-4 grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-xs text-muted-foreground">Date</p><p className="font-semibold">{journal.entry_date}</p></div>
            <div><p className="text-xs text-muted-foreground">Status</p>
              <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border', STATUS_COLORS[journal.status] || STATUS_COLORS.Draft)}>{journal.status}</span>
            </div>
            <div className="col-span-2"><p className="text-xs text-muted-foreground">Description</p><p className="font-medium">{journal.description}</p></div>
            <div>
              <p className="text-xs text-muted-foreground">Module</p>
              <span className={cn('inline-flex px-2 py-0.5 rounded text-xs font-medium', MODULE_COLORS[journal.reference_module] || MODULE_COLORS.General)}>{journal.reference_module}</span>
            </div>
            {journal.source_document_type && (
              <div><p className="text-xs text-muted-foreground">Source Document</p><p className="text-xs font-mono">{journal.source_document_type} #{journal.source_document_id?.slice(0, 8)}…</p></div>
            )}
            {journal.notes && <div className="col-span-2"><p className="text-xs text-muted-foreground">Notes</p><p className="text-sm">{journal.notes}</p></div>}
          </div>

          {/* Lines table */}
          <div>
            <p className="text-sm font-semibold mb-2">Journal Lines</p>
            {loading ? (
              <div className="space-y-2">{Array(3).fill(0).map((_, i) => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}</div>
            ) : (
              <div className="border border-border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Account</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Narration</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Debit (Dr)</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Credit (Cr)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {lines.map((line, i) => (
                      <tr key={i} className="hover:bg-muted/10">
                        <td className="px-3 py-2.5">
                          <span className="font-mono text-xs text-muted-foreground mr-1.5">{line.account_code}</span>
                          <span className="font-medium">{line.account_name}</span>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">{line.description || '—'}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-sm">
                          {line.debit_amount > 0 ? <span className="text-blue-700 font-semibold">{line.debit_amount.toLocaleString()}</span> : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-sm">
                          {line.credit_amount > 0 ? <span className="text-emerald-700 font-semibold">{line.credit_amount.toLocaleString()}</span> : <span className="text-muted-foreground">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-muted/30 border-t-2 border-border">
                    <tr>
                      <td colSpan={2} className="px-3 py-2.5 text-xs font-semibold">
                        <div className="flex items-center gap-1.5">
                          {isBalanced
                            ? <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /><span className="text-emerald-700">Balanced</span></>
                            : <><AlertCircle className="w-3.5 h-3.5 text-red-500" /><span className="text-red-600">Unbalanced</span></>
                          }
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-blue-700">{totalDebit.toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-emerald-700">{totalCredit.toLocaleString()}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {journal.status === 'Posted' && (
            <div className="mt-6 flex justify-end border-t border-border pt-4">
              <Button 
                variant="outline" 
                className="text-amber-600 border-amber-300 hover:bg-amber-50"
                onClick={() => setShowReverseDialog(true)}
                disabled={reversing || !isBalanced || lines.length === 0}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Reverse Journal
              </Button>
            </div>
          )}
        </div>
      </SheetContent>

      {/* Reverse Confirmation Dialog */}
      <Dialog open={showReverseDialog} onOpenChange={setShowReverseDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <RotateCcw className="w-4 h-4" /> Reverse Journal Entry
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg p-3 border bg-amber-50 border-amber-200">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />
              <div className="text-sm">
                <p className="font-medium text-amber-800">
                  This will create a new <strong>reversing entry</strong> with opposite debit/credit lines on the selected date. The original transaction will not be modified, but its status will change to Reversed.
                </p>
              </div>
            </div>

            <div>
              <Label>Reversal Date</Label>
              <Input
                type="date"
                className="mt-1"
                value={reverseDate}
                onChange={e => setReverseDate(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowReverseDialog(false)} disabled={reversing}>Cancel</Button>
              <Button
                className="bg-amber-600 hover:bg-amber-700 text-white"
                onClick={handleReverse}
                disabled={reversing || !reverseDate}
              >
                {reversing ? 'Reversing...' : 'Confirm Reverse'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}