import React, { useState, useEffect } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { PermissionGuard } from '@/components/shared/PermissionGuard';
import { 
  ShieldAlert, Search, RefreshCw, Calendar, User, Clock, Filter, Eye, Code 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

export default function UserSecurityAuditView() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAction, setFilterAction] = useState('ALL');
  const [selectedDetail, setSelectedDetail] = useState(null);

  useEffect(() => {
    fetchAuditLogs();
  }, []);

  const fetchAuditLogs = async () => {
    setLoading(true);
    try {
      const companyId = sajilo.getCompanyId();
      let query = sajilo.auth.supabase
        .from('SecurityAuditLog')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (companyId) {
        query = query.eq('company_id', companyId);
      }

      const { data, error } = await query;
      if (error) throw error;
      setLogs(data || []);
    } catch (e) {
      console.error("Failed to fetch security audit logs:", e);
      toast.error("Failed to load audit log entries");
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = logs.filter(log => {
    const matchesAction = filterAction === 'ALL' || log.action_type === filterAction;
    const matchesSearch = !searchQuery || 
      log.action_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.actor_id && log.actor_id.includes(searchQuery)) ||
      (log.target_user_id && log.target_user_id.includes(searchQuery));
    return matchesAction && matchesSearch;
  });

  const getActionBadge = (action) => {
    if (action.includes('SUSPEND') || action.includes('DEACTIVATE')) {
      return <span className="bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 text-xs px-2.5 py-0.5 rounded-full font-mono font-medium">{action}</span>;
    }
    if (action.includes('REMOVE') || action.includes('DELETE') || action.includes('REVOKE')) {
      return <span className="bg-red-100 text-red-800 border border-red-300 dark:bg-red-900/30 dark:text-red-300 text-xs px-2.5 py-0.5 rounded-full font-mono font-medium">{action}</span>;
    }
    if (action.includes('CREATE') || action.includes('GRANT') || action.includes('REACTIVATE')) {
      return <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300 text-xs px-2.5 py-0.5 rounded-full font-mono font-medium">{action}</span>;
    }
    return <span className="bg-blue-100 text-blue-800 border border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 text-xs px-2.5 py-0.5 rounded-full font-mono font-medium">{action}</span>;
  };

  return (
    <PermissionGuard permission="security_audit.read">
      <div className="space-y-4">
        {/* Header & Controls */}
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-primary" />
            <div>
              <h3 className="font-semibold text-foreground text-sm">Security & Governance Audit Trail</h3>
              <p className="text-xs text-muted-foreground">Immutable range-partitioned security event logs</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
              <Input 
                placeholder="Search audit trail..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>

            <Button variant="outline" size="sm" onClick={fetchAuditLogs} disabled={loading} className="h-9">
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </div>
        </div>

        {/* Audit Log Table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 text-muted-foreground uppercase font-semibold border-b border-border">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Action Type</th>
                  <th className="px-4 py-3">Actor ID</th>
                  <th className="px-4 py-3">Target User ID</th>
                  <th className="px-4 py-3">IP Address</th>
                  <th className="px-4 py-3 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-mono">
                {loading ? (
                  Array(4).fill(0).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={6} className="px-4 py-4">
                        <div className="h-4 bg-muted rounded animate-pulse w-full" />
                      </td>
                    </tr>
                  ))
                ) : filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                      No security audit events recorded yet.
                    </td>
                  </tr>
                ) : filteredLogs.map((log) => (
                  <tr key={`${log.id}-${log.created_at}`} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      {getActionBadge(log.action_type)}
                    </td>
                    <td className="px-4 py-3 font-mono text-muted-foreground truncate max-w-[120px]">
                      {log.actor_id ? log.actor_id.substring(0, 8) + '...' : 'System'}
                    </td>
                    <td className="px-4 py-3 font-mono text-muted-foreground truncate max-w-[120px]">
                      {log.target_user_id ? log.target_user_id.substring(0, 8) + '...' : '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {log.ip_address || '127.0.0.1'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedDetail(log)}>
                        <Code className="w-3.5 h-3.5 mr-1" /> View JSON
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detail JSON Modal */}
        <Dialog open={selectedDetail !== null} onOpenChange={(v) => !v && setSelectedDetail(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Code className="w-4 h-4 text-primary" /> Audit Payload Context
              </DialogTitle>
            </DialogHeader>

            {selectedDetail && (
              <div className="space-y-3 pt-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">Event ID:</span>
                  <span className="font-mono font-medium">{selectedDetail.id}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">Recorded At:</span>
                  <span className="font-mono font-medium">{new Date(selectedDetail.created_at).toISOString()}</span>
                </div>
                
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Metadata Payload (JSON):</span>
                  <pre className="bg-muted p-3 rounded-lg text-xs font-mono overflow-x-auto max-h-60 border border-border">
                    {JSON.stringify(selectedDetail.details || {}, null, 2)}
                  </pre>
                </div>

                <div className="flex justify-end pt-2">
                  <Button variant="outline" onClick={() => setSelectedDetail(null)}>Close</Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </PermissionGuard>
  );
}
