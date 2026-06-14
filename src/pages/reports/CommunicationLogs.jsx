import React, { useState, useEffect } from 'react';
import { sajilo, supabase } from '@/api/sajiloClient';
import { useAuth } from '@/lib/AuthContext';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { format } from 'date-fns';
import { Mail, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function CommunicationLogs() {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLogs() {
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
    }
    fetchLogs();
  }, []);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'SENT': return <Badge className="bg-green-500/10 text-green-700 hover:bg-green-500/20"><CheckCircle2 className="w-3 h-3 mr-1" /> Sent</Badge>;
      case 'FAILED': return <Badge variant="destructive" className="bg-red-500/10 text-red-700 hover:bg-red-500/20"><AlertCircle className="w-3 h-3 mr-1" /> Failed</Badge>;
      case 'PROCESSING': return <Badge variant="outline" className="text-blue-600 bg-blue-50"><Clock className="w-3 h-3 mr-1" /> Processing</Badge>;
      default: return <Badge variant="secondary" className="text-gray-600"><Clock className="w-3 h-3 mr-1" /> Pending</Badge>;
    }
  };

  const getTypeIcon = (type) => {
    if (type === 'EMAIL') return <Mail className="w-4 h-4 text-gray-500" />;
    return <Mail className="w-4 h-4 text-gray-500" />;
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading audit logs...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Email Delivery Logs</h2>
          <p className="text-muted-foreground text-sm">Immutable audit trail of all background email deliveries.</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="table-scroll-container">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Date / Time</TableHead>
                <TableHead>Module</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Error Log</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    No communication logs found.
                  </TableCell>
                </TableRow>
              ) : (
                logs.map(log => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {format(new Date(log.created_at), 'dd MMM yyyy')}
                      <div className="text-xs text-muted-foreground">{format(new Date(log.created_at), 'HH:mm:ss')}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{log.module}</div>
                      <div className="text-xs text-muted-foreground font-mono">{log.reference_id?.substring(0, 8)}...</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{log.recipient_email || '—'}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getTypeIcon(log.type)}
                        <span className="text-xs font-medium">{log.type}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(log.status)}
                      {log.retry_count > 0 && <div className="text-xs text-muted-foreground mt-1">Retries: {log.retry_count}</div>}
                    </TableCell>
                    <TableCell className="max-w-xs">
                      {log.status === 'FAILED' ? (
                        <span className="text-xs text-red-600 line-clamp-2" title={log.error_log}>{log.error_log}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
