import React, { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useGlobalVoucherDrawer } from '@/lib/GlobalVoucherContext';
import { sajilo } from '@/api/sajiloClient';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function GlobalVoucherDrawer() {
  const { isOpen, activeVoucherNumber, closeVoucher } = useGlobalVoucherDrawer();
  const [data, setData] = useState(null);
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen || !activeVoucherNumber) return;

    let isMounted = true;
    setLoading(true);
    setError(null);
    setData(null);
    setLines([]);

    const fetchVoucher = async () => {
      try {
        const cleanVoucherNumber = String(activeVoucherNumber).trim();
        const vNum = cleanVoucherNumber.toUpperCase();
        
        let entityName = '';
        let lineEntityName = '';
        let lineFk = '';
        let docNumberField = 'doc_number';
        let isFinancial = false;

        if (vNum.startsWith('INV-') || vNum.startsWith('SI-')) {
          entityName = 'SalesInvoice';
          lineEntityName = 'SalesInvoiceLine';
          lineFk = 'invoice_id';
          docNumberField = 'invoice_number';
        } else if (vNum.startsWith('PINV-') || vNum.startsWith('PI-')) {
          entityName = 'PurchaseInvoice';
          lineEntityName = 'PurchaseInvoiceLine';
          lineFk = 'invoice_id';
          docNumberField = 'invoice_number';
        } else if (vNum.startsWith('SO-')) {
          entityName = 'SalesOrder';
          lineEntityName = 'SalesOrderLine';
          lineFk = 'order_id';
          docNumberField = 'order_number';
        } else if (vNum.startsWith('PO-')) {
          entityName = 'PurchaseOrder';
          lineEntityName = 'PurchaseOrderLine';
          lineFk = 'order_id';
          docNumberField = 'order_number';
        } else if (vNum.startsWith('POS-')) {
          entityName = 'POSSale';
          lineEntityName = 'POSSaleLine';
          lineFk = 'sale_id';
          docNumberField = 'sale_number';
        } else if (vNum.startsWith('QT-')) {
          entityName = 'SalesQuotation';
          lineEntityName = 'SalesQuotationLine';
          lineFk = 'quotation_id';
          docNumberField = 'quotation_number';
        } else if (vNum.startsWith('SR-') || vNum.startsWith('SRN-')) {
          entityName = 'SalesReturn';
          lineEntityName = 'SalesReturnLine';
          lineFk = 'return_id';
          docNumberField = 'return_number';
        } else if (vNum.startsWith('PR-') || vNum.startsWith('PRN-')) {
          entityName = 'PurchaseReturn';
          lineEntityName = 'PurchaseReturnLine';
          lineFk = 'return_id';
          docNumberField = 'return_number';
        } else if (vNum.startsWith('RPOS-')) {
          entityName = 'POSReturn';
          lineEntityName = 'POSReturnLine';
          lineFk = 'return_id';
          docNumberField = 'return_number';
        } else if (vNum.startsWith('ADJ-')) {
          entityName = 'StockAdjustment';
          lineEntityName = 'StockAdjustmentLine';
          lineFk = 'adjustment_id';
          docNumberField = 'adjustment_number';
        } else if (vNum.startsWith('MO-')) {
          entityName = 'ManufacturingOrder';
          lineEntityName = 'ManufacturingOrderLine';
          lineFk = 'mo_id';
          docNumberField = 'mo_number';
        } else if (vNum.startsWith('SC-')) {
          entityName = 'ServiceContract';
          lineEntityName = 'ServiceContractLine'; // assuming this exists, if not it will fallback to line_items JSONB
          lineFk = 'contract_id';
          docNumberField = 'contract_reference';
        } else if (vNum.startsWith('JV-') || vNum.startsWith('REC-') || vNum.startsWith('PAY-') || vNum.startsWith('APV-') || vNum.startsWith('REV-') || vNum.startsWith('RV-') || vNum.startsWith('PV-') || vNum.startsWith('CV-') || vNum.startsWith('VV-')) {
          entityName = 'FinancialVoucher';
          lineEntityName = 'JournalEntry';
          lineFk = 'voucher_id';
          docNumberField = 'voucher_number';
          isFinancial = true;
        } else {
          // Unknown or custom prefix configured by user in settings.
          // Do not crash. Set entityName to null so it seamlessly falls back to GeneralLedgerJournal.
          entityName = null;
        }

        let headers = null;
        
        if (entityName) {
          // Try exact match first
          headers = await sajilo.entities[entityName].filter({ [docNumberField]: cleanVoucherNumber });
          
          // Fallback to case-insensitive and trimmed ilike match if exact match fails
          if (!headers || !headers.length) {
            const { data, error } = await sajilo.auth.supabase
              .from(entityName)
              .select('*')
              .ilike(docNumberField, cleanVoucherNumber);
            if (data && data.length > 0) {
              headers = data;
            }
          }
        }

        let usedFallback = false;
        if (!headers || !headers.length) {
          // Attempt to find it directly in GeneralLedgerJournal if the original header is missing
          // This catches orphans, reversals (-REV), and manual JVs
          let { data: journals } = await sajilo.auth.supabase
            .from('GeneralLedgerJournal')
            .select('*')
            .ilike('voucher_no', cleanVoucherNumber);
            
          if (!journals || journals.length === 0) {
            const { data: altJournals } = await sajilo.auth.supabase
              .from('GeneralLedgerJournal')
              .select('*')
              .ilike('source_document_id', cleanVoucherNumber);
            journals = altJournals;
          }
            
          if (journals && journals.length > 0) {
            const j = journals[0];
            // Fetch lines
            const { data: jLines } = await sajilo.auth.supabase
              .from('GeneralLedgerLine')
              .select('id, debit_amount, credit_amount, account_id')
              .eq('journal_id', j.id);
              
            const accIds = [...new Set((jLines || []).map(l => l.account_id).filter(Boolean))];
            let accsMap = {};
            if (accIds.length > 0) {
              const { data: accs } = await sajilo.auth.supabase
                .from('ChartOfAccount')
                .select('id, account_name')
                .in('id', accIds);
              (accs || []).forEach(a => accsMap[a.id] = a.account_name);
            }
              
            const mappedLines = (jLines || []).map(l => ({
              account_name: accsMap[l.account_id] || 'Unknown Account',
              debit_amount: l.debit_amount,
              credit_amount: l.credit_amount
            }));
            
            const fakeDoc = {
              id: j.id,
              voucher_number: j.voucher_no || j.source_document_id || cleanVoucherNumber,
              date: j.entry_date,
              remarks: j.narration || j.notes || j.description || 'Journal Entry',
              entries: mappedLines
            };
            
            headers = [fakeDoc];
            usedFallback = true;
          }
        }

        if (!headers || !headers.length) {
          throw new Error(`Voucher '${cleanVoucherNumber}' not found in database module '${entityName}'.`);
        }

        const doc = headers[0];
        
        let docLines = [];
        if (isFinancial || usedFallback) {
          docLines = doc.entries || [];
        } else {
          const rawLines = doc.line_items || [];
          
          const itemIds = [...new Set(rawLines.map(l => l.item_id).filter(Boolean))];
          let itemsMap = {};
          if (itemIds.length > 0) {
            const allItems = await sajilo.entities.Item.list();
            allItems.forEach(i => itemsMap[i.id] = i.name);
          }
          docLines = rawLines.map(l => ({ ...l, item_name: itemsMap[l.item_id] || l.item_name || 'Unknown Item' }));
        }

        if (isMounted) {
          setData({ ...doc, _isFinancial: isFinancial || usedFallback });
          setLines(docLines);
        }
      } catch (err) {
        if (isMounted) setError(err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchVoucher();

    return () => { isMounted = false; };
  }, [isOpen, activeVoucherNumber]);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && closeVoucher()}>
      <SheetContent className="sm:max-w-[700px] w-[90vw] overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle className="text-2xl font-bold flex items-center justify-between">
            {activeVoucherNumber}
            {data?.status && (
              <span className="text-sm font-medium px-2 py-1 rounded-full bg-slate-100 text-slate-700 uppercase tracking-wider">
                {data.status}
              </span>
            )}
          </SheetTitle>
          <SheetDescription>
            {data ? `Date: ${data.date || data.transaction_date || 'N/A'}` : 'Voucher Details View'}
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-6 w-1/3" />
          </div>
        ) : error ? (
          <div className="py-10 text-center text-red-500 font-medium">
            Error: {error}
          </div>
        ) : data ? (
          <div className="space-y-6">
            {/* Header Metadata */}
            <div className="grid grid-cols-2 gap-4 text-sm bg-slate-50 dark:bg-slate-900 p-4 rounded-lg border border-border">
              {data.partner_id && (
                <div>
                  <p className="text-muted-foreground mb-1">Partner / Party</p>
                  <p className="font-semibold">{data.partner_name || 'Mapped Partner'}</p>
                </div>
              )}
              {data.total_amount !== undefined && (
                <div>
                  <p className="text-muted-foreground mb-1">Total Amount</p>
                  <p className="font-semibold text-lg">NPR {(data.total_amount || 0).toLocaleString()}</p>
                </div>
              )}
              {data.remarks && (
                <div className="col-span-2">
                  <p className="text-muted-foreground mb-1">Remarks</p>
                  <p className="font-medium">{data.remarks}</p>
                </div>
              )}
            </div>

            {/* Matrix View */}
            <div className="border border-border rounded-lg overflow-hidden">
              <ScrollArea className="h-auto max-h-[50vh]">
                <Table>
                  <TableHeader className="bg-muted/50 sticky top-0 z-10">
                    <TableRow>
                      {data._isFinancial ? (
                        <>
                          <TableHead>Account</TableHead>
                          <TableHead className="text-right">Debit</TableHead>
                          <TableHead className="text-right">Credit</TableHead>
                        </>
                      ) : (
                        <>
                          <TableHead>Item Name</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Rate</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line, idx) => (
                      <TableRow key={line.id || idx}>
                        {data._isFinancial ? (
                          <>
                            <TableCell className="font-medium">{line.account_name}</TableCell>
                            <TableCell className="text-right">{line.debit_amount > 0 ? line.debit_amount.toLocaleString() : '-'}</TableCell>
                            <TableCell className="text-right">{line.credit_amount > 0 ? line.credit_amount.toLocaleString() : '-'}</TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell className="font-medium">{line.item_name}</TableCell>
                            <TableCell className="text-right">{line.quantity}</TableCell>
                            <TableCell className="text-right">{line.unit_price?.toLocaleString() || '-'}</TableCell>
                            <TableCell className="text-right">{(line.total_price || (line.quantity * line.unit_price))?.toLocaleString() || '-'}</TableCell>
                          </>
                        )}
                      </TableRow>
                    ))}
                    {lines.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={data._isFinancial ? 3 : 4} className="text-center py-6 text-muted-foreground">
                          No line items found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          </div>
        ) : (
          <div className="py-10 text-center text-muted-foreground">
            No data loaded.
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
