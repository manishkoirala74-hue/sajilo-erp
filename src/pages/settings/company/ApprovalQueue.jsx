import React, { useState, useEffect, useCallback } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { useAuth } from '@/lib/AuthContext';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronRight,
  FileText,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

const STATUS_CONFIG = {
  pending:  { label: 'Pending Review', icon: Clock,          color: 'text-amber-600',  bg: 'bg-amber-50 border-amber-200' },
  approved: { label: 'Approved',       icon: CheckCircle2,   color: 'text-green-600',  bg: 'bg-green-50 border-green-200' },
  rejected: { label: 'Rejected',       icon: XCircle,        color: 'text-red-600',    bg: 'bg-red-50 border-red-200' },
};

const ApprovalQueuePage = () => {
  const { user } = useAuth();
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reviewNotes, setReviewNotes] = useState({});
  const [processing, setProcessing] = useState({});
  const [filterStatus, setFilterStatus] = useState('pending');

  const isAdmin =
    user?.is_tenant_admin === true ||
    user?.role === 'admin' ||
    user?.role === 'owner' ||
    user?.role === 'tenant_admin';

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await sajilo.auth.supabase
        .from('ApprovalQueue')
        .select('*')
        .order('requested_at', { ascending: false });

      if (error) throw error;
      setQueue(data || []);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load approval queue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const handleDecision = async (item, decision) => {
    setProcessing((p) => ({ ...p, [item.id]: true }));
    try {
      const { error } = await sajilo.auth.supabase
        .from('ApprovalQueue')
        .update({
          status: decision,
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
          review_notes: reviewNotes[item.id] || null,
        })
        .eq('id', item.id);

      if (error) throw error;

      // If approved, restore the document to Posted status
      if (decision === 'approved') {
        await sajilo.auth.supabase
          .from(item.document_type)
          .update({ status: 'Posted' })
          .eq('id', item.document_id);
      } else {
        // Rejected — return to Draft so the submitter can edit
        await sajilo.auth.supabase
          .from(item.document_type)
          .update({ status: 'Draft' })
          .eq('id', item.document_id);
      }

      toast.success(
        decision === 'approved'
          ? 'Transaction approved and posted successfully'
          : 'Transaction rejected and returned to Draft'
      );
      fetchQueue();
    } catch (e) {
      console.error(e);
      toast.error('Failed to process decision');
    } finally {
      setProcessing((p) => ({ ...p, [item.id]: false }));
    }
  };

  const filtered = queue.filter((item) =>
    filterStatus === 'all' ? true : item.status === filterStatus
  );

  const pendingCount = queue.filter((i) => i.status === 'pending').length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Approval Queue</h1>
            <p className="text-muted-foreground mt-1">
              {isAdmin
                ? 'Review and approve or reject transactions that exceed the approval threshold.'
                : 'Track the status of your submitted transactions pending approval.'}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchQueue} className="flex items-center gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex gap-1 mt-4">
          {[
            { key: 'pending',  label: `Pending${pendingCount > 0 ? ` (${pendingCount})` : ''}` },
            { key: 'approved', label: 'Approved' },
            { key: 'rejected', label: 'Rejected' },
            { key: 'all',      label: 'All' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilterStatus(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filterStatus === key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <hr className="border-border mb-6" />

      {/* Queue List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-muted/30 animate-pulse rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <AlertCircle className="h-8 w-8 text-muted-foreground mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No items in this queue</p>
          <p className="text-xs text-muted-foreground mt-1">
            {filterStatus === 'pending'
              ? 'All transactions are within approval limits or have been reviewed.'
              : `No ${filterStatus} items found.`}
          </p>
        </div>
      ) : (
        <div className="space-y-3 pb-24">
          {filtered.map((item) => {
            const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
            const StatusIcon = cfg.icon;
            const isProcessing = processing[item.id];

            return (
              <div
                key={item.id}
                className="bg-card border border-border rounded-2xl p-5 shadow-sm"
              >
                {/* Top Row */}
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <span className="font-medium text-sm">{item.document_type}</span>
                      <span className="text-xs text-muted-foreground ml-2 font-mono">
                        #{item.document_id.slice(0, 8)}...
                      </span>
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5
                                rounded-full border ${cfg.bg} ${cfg.color}`}
                  >
                    <StatusIcon className="h-3 w-3" />
                    {cfg.label}
                  </span>
                </div>

                {/* Amount & Meta */}
                <div className="grid grid-cols-3 gap-4 mb-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Amount</p>
                    <p className="text-sm font-semibold">
                      {Number(item.amount).toLocaleString()} NPR
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Approval Limit</p>
                    <p className="text-sm">
                      {Number(item.approval_limit).toLocaleString()} NPR
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Submitted</p>
                    <p className="text-sm">
                      {formatDistanceToNow(new Date(item.requested_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>

                {/* Review Notes (read-only for resolved items) */}
                {item.status !== 'pending' && item.review_notes && (
                  <div className={`text-xs rounded-lg px-3 py-2 border mb-3 ${cfg.bg} ${cfg.color}`}>
                    <strong>Review note:</strong> {item.review_notes}
                  </div>
                )}

                {/* Admin Approve/Reject Controls */}
                {isAdmin && item.status === 'pending' && (
                  <div className="space-y-2 pt-2 border-t border-border">
                    <Textarea
                      placeholder="Optional review note..."
                      value={reviewNotes[item.id] || ''}
                      onChange={(e) =>
                        setReviewNotes((n) => ({ ...n, [item.id]: e.target.value }))
                      }
                      rows={2}
                      className="text-xs resize-none"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleDecision(item, 'approved')}
                        disabled={isProcessing}
                        className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-1"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {isProcessing ? 'Processing...' : 'Approve & Post'}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDecision(item, 'rejected')}
                        disabled={isProcessing}
                        className="flex items-center gap-1"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Reject
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ApprovalQueuePage;
