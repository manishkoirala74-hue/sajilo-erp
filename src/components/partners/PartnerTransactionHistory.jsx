import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/sajiloClient';
import { useDateFormat } from '@/lib/DateFormatContext';
import { FileText, Receipt } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function PartnerTransactionHistory({ partner, type }) {
  const { formatDate } = useDateFormat();
  
  const { data: history = [], isLoading: loading, error } = useQuery({
    queryKey: ['partnerLedgerHistory', partner?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_partner_ledger_history_rpc', {
        p_entity_id: partner.id
      });
      if (error) throw error;
      return data || [];
    },
    enabled: !!partner?.id,
    staleTime: 600000,
    refetchOnWindowFocus: false,
    retry: false
  });

  const getIconForDocType = (docType) => {
    if (docType === 'SalesInvoice') return <FileText className="w-4 h-4 text-blue-500" />;
    if (docType === 'PurchaseInvoice') return <FileText className="w-4 h-4 text-orange-500" />;
    if (docType === 'POSSale') return <FileText className="w-4 h-4 text-indigo-500" />;
    if (docType === 'FinancialVoucher') return <Receipt className="w-4 h-4 text-emerald-500" />;
    return <FileText className="w-4 h-4 text-slate-500" />;
  };

  const getDocTypeLabel = (docType) => {
    const mapping = {
      'SalesInvoice': 'Sales Invoice',
      'PurchaseInvoice': 'Purchase Invoice',
      'POSSale': 'POS Sale',
      'FinancialVoucher': 'Journal/Payment'
    };
    return mapping[docType] || docType;
  };

  return (
    <div className="w-full h-auto max-h-[400px] overflow-y-auto block">
      {loading ? (
        <div className="flex flex-col gap-2 py-8 px-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex gap-4 items-center">
              <div className="w-8 h-8 rounded-full bg-muted/50 animate-pulse" />
              <div className="h-4 bg-muted/50 rounded animate-pulse flex-1" />
              <div className="h-4 bg-muted/50 rounded animate-pulse w-24" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="p-4 text-sm text-red-500 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg">
          Failed to load history: {error}
        </div>
      ) : history.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center bg-muted/10 border border-dashed border-border rounded-xl">
          <div className="w-12 h-12 bg-muted/30 rounded-full flex items-center justify-center mb-3">
            <Receipt className="w-6 h-6 text-muted-foreground/50" />
          </div>
          <p className="text-muted-foreground">No ledger transactions found for this {type?.toLowerCase() || 'partner'}.</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden mt-2">
          <div className="w-full">
            <table className="table-fluid-grid text-sm w-full">
              <thead className="cell-density bg-muted/30 border-b border-border sticky top-0 z-10">
                <tr>
                  <th className="cell-density text-left text-xs font-semibold text-muted-foreground w-12"></th>
                  <th className="cell-density text-left text-xs font-semibold text-muted-foreground">Date</th>
                  <th className="cell-density text-left text-xs font-semibold text-muted-foreground">Document Type</th>
                  <th className="cell-density text-left text-xs font-semibold text-muted-foreground">Description</th>
                  <th className="cell-density text-right text-xs font-semibold text-muted-foreground">Debit</th>
                  <th className="cell-density text-right text-xs font-semibold text-muted-foreground">Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {history.map((row, idx) => (
                  <tr key={`${row.journal_id}-${idx}`} className="hover:bg-muted/20 transition-colors">
                    <td className="cell-density text-center">
                      {getIconForDocType(row.source_document_type)}
                    </td>
                    <td className="cell-density font-medium">
                      {formatDate(row.entry_date)}
                    </td>
                    <td className="cell-density">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground">
                        {getDocTypeLabel(row.source_document_type)}
                      </span>
                    </td>
                    <td className="cell-density text-muted-foreground truncate max-w-[250px]" title={row.description}>
                      {row.description || '—'}
                    </td>
                    <td className="cell-density font-mono text-right">
                      {row.debit_amount > 0 ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                          {Number(row.debit_amount).toLocaleString()}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="cell-density font-mono text-right">
                      {row.credit_amount > 0 ? (
                        <span className="text-blue-600 dark:text-blue-400 font-semibold">
                          {Number(row.credit_amount).toLocaleString()}
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground bg-muted/10">
            {history.length} transactions shown
          </div>
        </div>
      )}
    </div>
  );
}
