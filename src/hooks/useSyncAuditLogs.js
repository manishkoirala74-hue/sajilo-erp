import { useEffect } from 'react';
import { supabase } from '@/api/sajiloClient';

export function useSyncAuditLogs() {
  useEffect(() => {
    const syncLogs = async () => {
      try {
        const storedLogs = localStorage.getItem('erp_failed_audit_logs');
        if (!storedLogs) return;

        const queue = JSON.parse(storedLogs);
        if (!Array.isArray(queue) || queue.length === 0) return;

        // Try to push one by one to avoid total failure if one payload is malformed
        const remainingQueue = [];
        
        for (const log of queue) {
          try {
            // Remove our local metadata before pushing to Supabase
            const { _id, _queuedAt, ...payload } = log;
            await supabase.rpc('log_report_generation', payload);
          } catch (err) {
            console.error('Failed to sync audit log entry:', err);
            remainingQueue.push(log);
          }
        }

        if (remainingQueue.length === 0) {
          localStorage.removeItem('erp_failed_audit_logs');
        } else {
          localStorage.setItem('erp_failed_audit_logs', JSON.stringify(remainingQueue));
        }
      } catch (err) {
        console.error('Audit queue sync failed:', err);
      }
    };

    // Attempt sync on mount
    syncLogs();

    // Also attempt sync when coming back online
    window.addEventListener('online', syncLogs);
    return () => window.removeEventListener('online', syncLogs);
  }, []);
}
