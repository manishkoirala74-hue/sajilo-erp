import { useState } from 'react';
import { sajilo, supabase } from '@/api/sajiloClient';
import { Button } from '@/components/ui/button';
import { RefreshCw, AlertTriangle, DatabaseBackup } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import DateInput from '@/components/shared/DateInput';

export default function DataUtilities() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const handleRecalculate = async () => {
    if (!startDate || !endDate) {
      toast.error('Please select both start and end dates for the recalculation period.');
      return;
    }
    const companyId = sajilo.getCompanyId();
    if (!companyId) {
      toast.error('Company ID not found. Please log out and log back in.');
      return;
    }

    setLoading(true);
    const toastId = toast.loading('Recalculating inventory cost timeline. This may take a while...');
    try {
      const { error } = await supabase.rpc('rebuild_inventory_wac_timeline', {
        p_company_id: companyId,
        p_start_date: startDate,
        p_end_date: endDate
      });

      if (error) throw error;
      toast.success('Inventory Cost Timeline successfully rebuilt!', { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error(`Recalculation failed: ${err.message || 'Unknown error'}`, { id: toastId, duration: 8000 });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Action Card: Ledger Timeline Recovery */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-primary/10 rounded-lg text-primary shrink-0">
            <DatabaseBackup className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-sm text-foreground">Ledger Timeline Recovery</h3>
            <p className="text-xs text-muted-foreground mt-1 mb-4 leading-relaxed max-w-2xl">
              Chronologically rebuild the inventory Weighted Average Cost (WAC) timeline. This utility isolates all purchases, sales, and stock adjustments within the specified period and recalculates the historical moving average cost point-in-time, stamping it safely onto all posted transactions.
            </p>
            
            <div className="flex items-center gap-4 mb-4">
              <div className="w-52">
                <DateInput 
                  label="Period Start Date" 
                  value={startDate} 
                  onChange={setStartDate} 
                />
              </div>
              <div className="w-52">
                <DateInput 
                  label="Period End Date" 
                  value={endDate} 
                  onChange={setEndDate} 
                />
              </div>
            </div>

            <Button 
              onClick={handleRecalculate} 
              disabled={loading} 
              className="gap-2"
              variant="default"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Rebuilding Timeline...' : 'Recalculate Inventory Cost Timeline'}
            </Button>

            {/* Warning Callout Box */}
            <div className="mt-4 flex items-start gap-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
              <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div>
                <strong>Warning:</strong> This operation locks inventory recalculation states momentarily. 
                Do not run this during peak business hours. Only specify the unclosed current fiscal year to prevent altering previously audited and locked financial periods.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
