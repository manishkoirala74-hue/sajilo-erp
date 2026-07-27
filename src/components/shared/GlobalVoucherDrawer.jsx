import React, { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useGlobalVoucherDrawer } from '@/lib/GlobalVoucherContext';
import { sajilo } from '@/api/sajiloClient';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';

// Adapter to normalize diverse voucher structures into a predictable drawer format
const normalizeVoucherData = (data, lines, fallbackFlag, financialFlag) => {
  return {
    raw: data,
    title: data.voucher_number || data.invoice_number || data.return_number || data.order_number || data.sale_number || data.adjustment_number || data.contract_reference || data.id,
    status: data.status,
    date: data.date || data.transaction_date || data.invoice_date || data.order_date || data.entry_date || 'N/A',
    partnerName: data.partner_name || data.vendor_name || data.customer_name || 'Mapped Partner',
    hasPartner: !!(data.partner_id || data.vendor_id || data.customer_id),
    total: data.total_amount ?? data.grand_total ?? data.total_price ?? data.total_debit ?? 0,
    remarks: data.remarks || data.narration || data.notes || data.description,
    isFinancial: financialFlag || fallbackFlag,
    lines: lines || []
  };
};

export default function GlobalVoucherDrawer() {
  const { isOpen, activeVoucherNumber, closeVoucher } = useGlobalVoucherDrawer();
  const [data, setData] = useState(null);
  const [lines, setLines] = useState([]);
  const [normalizedData, setNormalizedData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen || !activeVoucherNumber) return;

    let isMounted = true;
    setLoading(true);
    setError(null);
    setData(null);
    setLines([]);
    setNormalizedData(null);

    const fetchVoucher = async () => {
      try {
        const cleanVoucherNumber = String(activeVoucherNumber).trim();
        const vNum = cleanVoucherNumber.toUpperCase();
        
        let entityName = '';
        let docNumberField = 'doc_number';
        let isFinancial = false;

        if (vNum.startsWith('INV-') || vNum.startsWith('SI-')) {
          entityName = 'SalesInvoice';
          docNumberField = 'invoice_number';
        } else if (vNum.startsWith('PINV-') || vNum.startsWith('PI-')) {
          entityName = 'PurchaseInvoice';
          docNumberField = 'invoice_number';
        } else if (vNum.startsWith('SO-')) {
          entityName = 'SalesOrder';
          docNumberField = 'order_number';
        } else if (vNum.startsWith('PO-')) {
          entityName = 'PurchaseOrder';
          docNumberField = 'order_number';
        } else if (vNum.startsWith('POS-')) {
          entityName = 'POSSale';
          docNumberField = 'sale_number';
        } else if (vNum.startsWith('QT-')) {
          entityName = 'Quotation';
          docNumberField = 'quotation_number';
        } else if (vNum.startsWith('SR-') || vNum.startsWith('SRN-')) {
          entityName = 'SalesReturn';
          docNumberField = 'return_number';
        } else if (vNum.startsWith('PR-') || vNum.startsWith('PRN-')) {
          entityName = 'PurchaseReturn';
          docNumberField = 'return_number';
        } else if (vNum.startsWith('RPOS-')) {
          entityName = 'POSReturn';
          docNumberField = 'return_number';
        } else if (vNum.startsWith('ADJ-')) {
          entityName = 'StockAdjustment';
          docNumberField = 'adjustment_number';
        } else if (vNum.startsWith('MO-')) {
          entityName = 'ManufacturingOrder';
          docNumberField = 'mo_number';
        } else if (vNum.startsWith('SC-')) {
          entityName = 'ServiceContract';
          docNumberField = 'contract_reference';
        } else if (vNum.startsWith('JV-') || vNum.startsWith('REC-') || vNum.startsWith('PAY-') || vNum.startsWith('APV-') || vNum.startsWith('REV-') || vNum.startsWith('RV-') || vNum.startsWith('PV-') || vNum.startsWith('CV-') || vNum.startsWith('VV-')) {
          entityName = 'FinancialVoucher';
          docNumberField = 'voucher_number';
          isFinancial = true;
        } else {
          entityName = null;
        }

        let headers = null;
        
        if (entityName) {
          headers = await sajilo.entities[entityName].filter({ [docNumberField]: cleanVoucherNumber });
          if (!headers || !headers.length) {
            const { data, error } = await sajilo.auth.supabase
              .from(entityName)
              .select('*')
              .ilike(docNumberField, cleanVoucherNumber);
            if (data && data.length > 0) headers = data;
          }
        }

        let usedFallback = false;
        if (!headers || !headers.length) {
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
            const { data: jLines } = await sajilo.auth.supabase
              .from('GeneralLedgerLine')
              .select('id, debit_amount, credit_amount, account_id, account_name')
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
              account_name: l.account_name || accsMap[l.account_id] || 'Unknown Account',
              debit_amount: l.debit_amount,
              credit_amount: l.credit_amount
            }));
            
            const fakeDoc = {
              id: j.id,
              voucher_number: j.voucher_no || j.source_document_id || cleanVoucherNumber,
              date: j.entry_date,
              remarks: j.narration || j.notes || j.description || 'Journal Entry',
              entries: mappedLines,
              total_amount: j.total_debit
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
          const rawLines = (doc.line_items || []).filter(l => l.item_id || l.item_name || (l.quantity && l.quantity > 0) || (l.line_total && l.line_total > 0));
          const itemIds = [...new Set(rawLines.map(l => l.item_id).filter(Boolean))];
          let itemsMap = {};
          if (itemIds.length > 0) {
            const { data: matchedItems } = await sajilo.auth.supabase
              .from('Item')
              .select('id, item_name')
              .in('id', itemIds);
            (matchedItems || []).forEach(i => itemsMap[i.id] = i.item_name);
          }
          docLines = rawLines.map(l => ({ ...l, item_name: itemsMap[l.item_id] || l.item_name || (l.item_id ? 'Unknown Item' : 'Unspecified Item') }));
        }

        if (isMounted) {
          setData(doc);
          setLines(docLines);
          setNormalizedData(normalizeVoucherData(doc, docLines, usedFallback, isFinancial));
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
            {normalizedData ? normalizedData.title : activeVoucherNumber}
            {normalizedData?.status && (
              <span className="text-sm font-medium px-2 py-1 rounded-full bg-slate-100 text-slate-700 uppercase tracking-wider">
                {normalizedData.status}
              </span>
            )}
          </SheetTitle>
          <SheetDescription>
            {normalizedData ? `Date: ${normalizedData.date}` : 'Voucher Details View'}
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
        ) : normalizedData ? (
          <div className="space-y-6">
            {/* Header Metadata */}
            <div className="grid grid-cols-2 gap-4 text-sm bg-slate-50 dark:bg-slate-900 p-4 rounded-lg border border-border">
              {normalizedData.hasPartner && (
                <div>
                  <p className="text-muted-foreground mb-1">Partner / Party</p>
                  <p className="font-semibold">{normalizedData.partnerName}</p>
                </div>
              )}
              {normalizedData.total !== undefined && (
                <div>
                  <p className="text-muted-foreground mb-1">Total Amount</p>
                  <p className="font-semibold text-lg">NPR {(normalizedData.total || 0).toLocaleString()}</p>
                </div>
              )}
              {normalizedData.remarks && (
                <div className="col-span-2">
                  <p className="text-muted-foreground mb-1">Remarks</p>
                  <p className="font-medium">{normalizedData.remarks}</p>
                </div>
              )}
            </div>

            {/* Matrix View */}
            <div className="border border-border rounded-lg overflow-hidden bg-card">
              <ScrollArea className="h-auto max-h-[50vh]">
                {/* Desktop Table View */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader className="bg-muted/50 sticky top-0 z-10">
                      <TableRow>
                        {normalizedData.isFinancial ? (
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
                      {normalizedData.lines.map((line, idx) => {
                        const qty = line.quantity ?? line.qty;
                        const rate = line.unit_price ?? line.rate ?? line.price;
                        const total = line.line_total ?? line.amount ?? line.total_price ?? line.total ?? (qty != null && rate != null && !isNaN(qty * rate) ? qty * rate : null);

                        return (
                        <TableRow key={line.id || idx}>
                          {normalizedData.isFinancial ? (
                            <>
                              <TableCell className="font-medium">{line.account_name}</TableCell>
                              <TableCell className="text-right">{line.debit_amount > 0 ? line.debit_amount.toLocaleString() : '-'}</TableCell>
                              <TableCell className="text-right">{line.credit_amount > 0 ? line.credit_amount.toLocaleString() : '-'}</TableCell>
                            </>
                          ) : (
                            <>
                              <TableCell className="font-medium">{line.item_name}</TableCell>
                              <TableCell className="text-right">{qty != null ? qty : '-'}</TableCell>
                              <TableCell className="text-right">{rate != null ? Number(rate).toLocaleString() : '-'}</TableCell>
                              <TableCell className="text-right">{total != null ? Number(total).toLocaleString() : '-'}</TableCell>
                            </>
                          )}
                        </TableRow>
                      )})}
                      {normalizedData.lines.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={normalizedData.isFinancial ? 3 : 4} className="text-center py-6 text-muted-foreground">
                            No line items found.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile Card View */}
                <div className="block md:hidden divide-y divide-border">
                  {normalizedData.lines.map((line, idx) => {
                    const qty = line.quantity ?? line.qty;
                    const rate = line.unit_price ?? line.rate ?? line.price;
                    const total = line.line_total ?? line.amount ?? line.total_price ?? line.total ?? (qty != null && rate != null && !isNaN(qty * rate) ? qty * rate : null);

                    return (
                      <div key={line.id || idx} className="p-4 space-y-2">
                        {normalizedData.isFinancial ? (
                          <>
                            <div className="font-medium text-foreground">{line.account_name}</div>
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Debit</span>
                              <span className="font-semibold">{line.debit_amount > 0 ? line.debit_amount.toLocaleString() : '-'}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Credit</span>
                              <span className="font-semibold">{line.credit_amount > 0 ? line.credit_amount.toLocaleString() : '-'}</span>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="font-medium text-foreground">{line.item_name}</div>
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Quantity</span>
                              <span>{qty != null ? qty : '-'}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Rate</span>
                              <span>{rate != null ? Number(rate).toLocaleString() : '-'}</span>
                            </div>
                            <div className="flex justify-between text-sm border-t border-border pt-2 mt-2">
                              <span className="font-semibold">Total</span>
                              <span className="font-semibold text-primary">{total != null ? Number(total).toLocaleString() : '-'}</span>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                  {normalizedData.lines.length === 0 && (
                    <div className="p-6 text-center text-muted-foreground">
                      No line items found.
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        ) : (
          <div className="py-10 text-center text-muted-foreground" role="status" aria-label="No data loaded">
            No data loaded.
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
