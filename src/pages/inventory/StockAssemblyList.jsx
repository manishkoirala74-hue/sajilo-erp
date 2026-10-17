import React, { useState, useEffect } from 'react';
import { sajilo, supabase } from '@/api/sajiloClient';
import { Plus, Edit2, Layers, RotateCcw, Trash2, Eye, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { queryClientInstance } from '@/lib/query-client';
import StockAssemblyForm from './StockAssemblyForm';

export default function StockAssemblyList() {
  const [assemblies, setAssemblies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // Cancellation Modal state
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  // Draft Delete Confirmation state
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchAssemblies();
  }, []);

  const fetchAssemblies = async () => {
    setLoading(true);
    try {
      const data = await sajilo.entities.StockAssembly.list('-created_at');
      setAssemblies(data || []);
    } catch (error) {
      toast.error('Failed to fetch stock assemblies');
    } finally {
      setLoading(false);
    }
  };

  const openNew = () => { 
    setEditingId(null); 
    setShowForm(true); 
  };
  
  const openEdit = (id) => { 
    setEditingId(id); 
    setShowForm(true); 
  };

  const handleSaved = () => {
    setShowForm(false);
    fetchAssemblies();
  };

  const handleCancelSubmit = async () => {
    if (!cancelReason.trim()) {
      toast.error('Please enter a cancellation reason');
      return;
    }

    setCancelling(true);
    try {
      const companyId = sajilo.getCompanyId();
      const { data, error } = await supabase.rpc('cancel_stock_assembly', {
        p_assembly_id: cancelTarget.id,
        p_company_id: companyId,
        p_reason: cancelReason.trim()
      });

      if (error) throw error;

      queryClientInstance.invalidateQueries({ queryKey: ['CurrentStock'] });
      queryClientInstance.invalidateQueries({ queryKey: ['Item'] });
      queryClientInstance.invalidateQueries({ queryKey: ['StockAssembly'] });

      try {
        const syncChannel = new BroadcastChannel('sajilo_sync');
        syncChannel.postMessage({ type: 'INVALIDATE', tableName: 'CurrentStock' });
        syncChannel.postMessage({ type: 'INVALIDATE', tableName: 'Item' });
        syncChannel.postMessage({ type: 'INVALIDATE', tableName: 'StockAssembly' });
        syncChannel.close();
      } catch (bcErr) {}

      window.dispatchEvent(new CustomEvent('sajilo_invalidate', { detail: 'CurrentStock' }));
      window.dispatchEvent(new CustomEvent('sajilo_invalidate', { detail: 'Item' }));

      toast.success(data?.message || 'Stock Assembly successfully cancelled and reversed!');
      setCancelTarget(null);
      setCancelReason('');
      fetchAssemblies();
    } catch (err) {
      toast.error(err.message || 'Failed to cancel stock assembly');
    } finally {
      setCancelling(false);
    }
  };

  const handleDeleteDraft = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await sajilo.entities.StockAssembly.delete(deleteTarget.id);
      queryClientInstance.invalidateQueries({ queryKey: ['StockAssembly'] });
      toast.success('Draft assembly deleted successfully');
      setDeleteTarget(null);
      fetchAssemblies();
    } catch (err) {
      toast.error(err.message || 'Failed to delete draft assembly');
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    {
      key: 'assembly_no', label: 'Assembly No',
      render: (val) => (
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center">
            <Layers className="w-4 h-4 text-indigo-500" />
          </div>
          <span className="font-medium text-sm">{val}</span>
        </div>
      )
    },
    { 
      key: 'assembly_date', label: 'Date',
      render: v => v ? format(new Date(v), 'MMM dd, yyyy') : '—'
    },
    { 
      key: 'total_cost', label: 'Total Value',
      render: v => <span className="font-mono font-medium">NPR {(Number(v) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
    },
    { 
      key: 'status', label: 'Status',
      render: v => (
        <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${
          v === 'Completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400' 
          : v === 'Draft' ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400'
          : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400'
        }`}>
          {v}
        </span>
      )
    },
    {
      key: 'actions', label: '',
      render: (_, row) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-8 px-2.5 text-xs text-slate-600 dark:text-slate-300 hover:text-indigo-600"
            onClick={() => openEdit(row.id)}
          >
            {row.status === 'Draft' ? (
              <span className="flex items-center gap-1"><Edit2 className="w-3.5 h-3.5" /> Edit</span>
            ) : (
              <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> View</span>
            )}
          </Button>

          {row.status === 'Completed' && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2.5 text-xs text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/30 hover:bg-red-50 dark:hover:bg-red-500/10"
              onClick={() => {
                setCancelTarget(row);
                setCancelReason('');
              }}
              title="Reverse / Cancel Assembly"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1" />
              Reverse
            </Button>
          )}

          {row.status === 'Draft' && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-slate-400 hover:text-red-600"
              onClick={() => setDeleteTarget(row)}
              title="Delete Draft"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      )
    }
  ];

  return (
    <div>
      <PageHeader
        title="Stock Assembly"
        subtitle="Ad-Hoc Conversions & Production Builds"
        action={openNew}
        actionLabel="New Assembly"
        actionIcon={Plus}
      />
      
      <DataTable columns={columns} data={assemblies} searchKey="assembly_no" loading={loading} />

      {showForm && (
        <StockAssemblyForm 
          assemblyId={editingId} 
          onClose={() => setShowForm(false)} 
          onSaved={handleSaved} 
        />
      )}

      {/* Cancellation / Reversal Modal */}
      <Dialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertTriangle className="w-5 h-5" />
              Reverse Stock Assembly
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Are you sure you want to reverse assembly <strong>{cancelTarget?.assembly_no}</strong>?
              This will restore all consumed raw materials back to inventory, deduct the produced finished goods, and post a balanced reversal voucher to the General Ledger.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Cancellation Reason *</Label>
              <Input
                placeholder="e.g. Defective batch, incorrect BOM ratio, user mistake"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                disabled={cancelling}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setCancelTarget(null)} disabled={cancelling}>
              Keep Assembly
            </Button>
            <Button variant="destructive" size="sm" onClick={handleCancelSubmit} disabled={cancelling}>
              {cancelling ? 'Reversing...' : 'Confirm Reversal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Draft Confirmation Modal */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground text-sm font-semibold">
              <Trash2 className="w-4 h-4 text-red-500" />
              Delete Draft Assembly?
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground py-2">
            Are you sure you want to delete draft assembly <strong>{deleteTarget?.assembly_no}</strong>? This action cannot be undone.
          </p>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDeleteDraft} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete Draft'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
