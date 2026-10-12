import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/api/sajiloClient';
import { useAuth } from '@/lib/AuthContext';
import { format } from 'date-fns';
import { Mail, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ReportPageTemplate, StandardReportTable } from '@/components/reports';

export default function CommunicationLogs() {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('CommunicationOutbox')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setLogs(data || []);
    } catch (err) {
      console.error("Failed to fetch communication logs", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'SENT': return <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"><CheckCircle2 className="w-3 h-3 mr-1" /> Sent</Badge>;
      case 'FAILED': return <Badge variant="destructive" className="bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20"><AlertCircle className="w-3 h-3 mr-1" /> Failed</Badge>;
      case 'PROCESSING': return <Badge variant="outline" className="text-blue-600 bg-blue-50 dark:bg-blue-950/40 border-blue-300"><Clock className="w-3 h-3 mr-1" /> Processing</Badge>;
      default: return <Badge variant="secondary" className="text-muted-foreground"><Clock className="w-3 h-3 mr-1" /> Pending</Badge>;
    }
  };

  const columns = useMemo(() => [
    {
      key: 'created_at',
      label: 'Date / Time',
      width: '140px',
      render: (v) => (
        <div>
          <span className="font-medium text-xs text-foreground">{format(new Date(v), 'dd MMM yyyy')}</span>
          <span className="text-[10px] text-muted-foreground block font-mono">{format(new Date(v), 'HH:mm:ss')}</span>
        </div>
      ),
      exportValue: (r) => format(new Date(r.created_at), 'yyyy-MM-dd HH:mm:ss')
    },
    {
      key: 'module',
      label: 'Module / Reference',
      preset: 'description',
      render: (v, r) => (
        <div>
          <span className="font-semibold text-foreground text-xs">{v || 'System'}</span>
          <span className="text-[10px] text-muted-foreground font-mono block">Ref: {r.reference_id?.substring(0, 12)}</span>
        </div>
      ),
      exportValue: (r) => `${r.module || ''} (${r.reference_id || ''})`
    },
    {
      key: 'recipient_email',
      label: 'Recipient Email',
      preset: 'description',
      render: (v) => <span className="font-mono text-xs text-foreground/90">{v || '—'}</span>
    },
    {
      key: 'type',
      label: 'Channel',
      width: '100px',
      align: 'center',
      render: (v) => (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Mail className="w-3.5 h-3.5" /> {v || 'EMAIL'}
        </span>
      )
    },
    {
      key: 'status',
      label: 'Delivery Status',
      preset: 'status',
      render: (v, r) => (
        <div>
          {getStatusBadge(v)}
          {r.retry_count > 0 && <span className="text-[10px] text-muted-foreground block mt-0.5">Retries: {r.retry_count}</span>}
        </div>
      ),
      exportValue: (r) => r.status
    },
    {
      key: 'error_log',
      label: 'Error Diagnostic',
      preset: 'description',
      render: (v, r) => (
        r.status === 'FAILED' ? (
          <span className="text-xs text-red-600 dark:text-red-400 font-mono line-clamp-2" title={v || r.error_message}>
            {v || r.error_message || 'Dispatch failure'}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/60">—</span>
        )
      ),
      exportValue: (r) => r.error_log || r.error_message || ''
    }
  ], []);

  return (
    <ReportPageTemplate
      title="Communication Audit Logs"
      subtitle="Immutable audit trail of email dispatches, alerts, and notifications sent from Sajilo ERP"
      category="System"
      icon={Mail}
      isLoading={loading}
      onRefresh={fetchLogs}
      exportConfig={{
        columns,
        data: logs,
        filename: `Communication_Logs_${format(new Date(), 'yyyyMMdd_HHmmss')}`,
        orientation: 'landscape'
      }}
    >
      <StandardReportTable
        columns={columns}
        data={logs}
        loading={loading}
        emptyMessage="No outgoing communication logs recorded."
      />
    </ReportPageTemplate>
  );
}
