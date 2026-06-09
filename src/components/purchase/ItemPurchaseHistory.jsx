import { useState, useEffect } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { History, ChevronDown, ChevronRight } from 'lucide-react';

export default function ItemPurchaseHistory({ vendorId }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!vendorId || !expanded) return;
    setLoading(true);
    sajilo.entities.PurchaseInvoice.filter({ vendor_id: vendorId, status: 'Posted' }, '-invoice_date', 10)
      .then(data => { setHistory(data); setLoading(false); });
  }, [vendorId, expanded]);

  const allLines = history.flatMap(inv =>
    (inv.line_items || []).map(l => ({
      ...l,
      invoice_number: inv.invoice_number,
      invoice_date: inv.invoice_date,
    }))
  );

  // Group by item name, keep latest price
  const byItem = Object.values(
    allLines.reduce((acc, l) => {
      if (!acc[l.item_name]) acc[l.item_name] = { ...l, occurrences: 1 };
      else acc[l.item_name].occurrences += 1;
      return acc;
    }, {})
  );

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-2 px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors text-sm font-medium text-foreground"
      >
        <History className="w-4 h-4 text-primary" />
        Past Purchase History from this Vendor
        {expanded ? <ChevronDown className="w-4 h-4 ml-auto text-muted-foreground" /> : <ChevronRight className="w-4 h-4 ml-auto text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="p-3">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-4">Loading history…</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No posted invoices found for this vendor</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground mb-2">Last {history.length} posted invoice(s) — {allLines.length} line items</p>
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left">Item</th>
                    <th className="px-3 py-2 text-left">Last Invoice</th>
                    <th className="px-3 py-2 text-right">Last Qty</th>
                    <th className="px-3 py-2 text-right">Last Price</th>
                    <th className="px-3 py-2 text-right">Times Bought</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {byItem.map((l, i) => (
                    <tr key={i} className="hover:bg-muted/20">
                      <td className="px-3 py-2 font-medium">{l.item_name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{l.invoice_date} ({l.invoice_number})</td>
                      <td className="px-3 py-2 text-right">{l.quantity}</td>
                      <td className="px-3 py-2 text-right font-semibold text-primary">NPR {Number(l.unit_price).toLocaleString()}</td>
                      <td className="px-3 py-2 text-right">{l.occurrences}×</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </div>
  );
}