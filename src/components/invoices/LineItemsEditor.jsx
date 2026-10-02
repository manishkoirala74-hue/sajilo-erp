import React, { useState, useRef, useCallback, useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import SearchableSelect from '@/components/shared/SearchableSelect';
import { computeItemTaxes } from '@/lib/taxService';
import { useItemTradingHistory } from '@/hooks/useItemTradingHistory';
import { useItemsQuery, useSettingsQuery } from '@/hooks/useSajiloQuery';
import { toast } from 'sonner';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
} from '@/components/ui/drawer';

const emptyLine = {
  item_id: '', item_name: '', item_code: '', hs_code: '',
  quantity: 1, unit_price: 0,
  vat_applicable: false,
  tax_type_ids: [],
  tax_amount: 0,
  line_total: 0,
};

// ----------------------------------------------------------------------
// Memoized Row Component (Fixes 200k allocations and stale closures)
// ----------------------------------------------------------------------
const LineItemRow = React.memo(function LineItemRow({
  line,
  items,
  taxTypes,
  updateLine,
  removeLine,
  isOpenHistory,
  toggleHistory,
  settings,
  isHistoryLoading,
  historyError,
  tradingHistory
}) {
  const appliedTaxes = useMemo(() => {
    return (line.tax_type_ids || [])
      .map(id => taxTypes.find(t => t.id === id))
      .filter(Boolean)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }, [line.tax_type_ids, taxTypes]);

  const selectOptions = useMemo(() => {
    return items.map(i => ({ 
      value: i.id, 
      label: i.item_name, 
      sub: i.item_code || i.unit_of_measure, 
      code: i.item_code, 
      unit: i.unit_of_measure 
    }));
  }, [items]);

  return (
    <React.Fragment>
      <tr className="border-b border-stone-100 last:border-0">
        <td className="cell-density">
          <SearchableSelect
            data-row={line.lineKey}
            data-col="item_id"
            value={line.item_id}
            onValueChange={v => updateLine(line.lineKey, { item_id: v })}
            options={selectOptions}
            placeholder="Select item..."
            className="w-full h-8 text-sm bg-card"
            onCreateNew={() => window.open('/inventory/items/new', '_blank')}
            createNewText="New Item"
            onCommit={() => {
              // Yield focus to quantity column after selection
              document.querySelector(`[data-row="${line.lineKey}"][data-col="quantity"]`)?.focus();
            }}
          />
          {!line.item_id && line.item_name && (
            <Input 
              data-row={line.lineKey}
              data-col="item_name"
              value={line.item_name} 
              onChange={e => updateLine(line.lineKey, { item_name: e.target.value })} 
              placeholder="Item name" 
              className="mt-1 h-7 text-sm" 
            />
          )}
        </td>
        <td className="cell-density">
          <Input 
            data-row={line.lineKey}
            data-col="quantity"
            type="number" 
            min="0" 
            value={line.quantity} 
            onChange={e => updateLine(line.lineKey, { quantity: parseFloat(e.target.value) || 0 })} 
            className="h-8 text-sm" 
          />
        </td>
        <td className="cell-density">
          <Input 
            data-row={line.lineKey}
            data-col="unit_price"
            type="number" 
            min="0" 
            step="0.01" 
            value={line.unit_price} 
            onChange={e => updateLine(line.lineKey, { unit_price: parseFloat(e.target.value) || 0 })} 
            className="h-8 text-sm" 
          />
        </td>
        <td className="cell-density text-center">
          {appliedTaxes.length > 0 ? (
            <div className="flex flex-col items-center gap-0.5">
              {appliedTaxes.map(tt => (
                <span key={tt.id} className="text-xs font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded whitespace-nowrap">
                  {tt.tax_rate}%{tt.is_compound ? '⊕' : ''}
                </span>
              ))}
              {line.tax_amount > 0 && <span className="text-xs text-muted-foreground tabular-nums">+{line.tax_amount.toLocaleString()}</span>}
            </div>
          ) : <span className="text-xs text-muted-foreground">—</span>}
        </td>
        <td className="cell-density text-right font-medium">NPR {Number(line.line_total || 0).toLocaleString()}</td>
        <td className="cell-density">
          <div className="flex items-center gap-1">
            {settings?.show_recent_trading_history !== false && line.item_id && (
              <Button 
                variant="ghost" 
                size="sm" 
                className={`h-7 px-2 text-xs ${isOpenHistory ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`} 
                onClick={(e) => { e.preventDefault(); toggleHistory(line.lineKey, line.item_id); }}
              >
                History
              </Button>
            )}
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-7 w-7 text-red-400 hover:text-red-600" 
              onClick={() => removeLine(line.lineKey)} 
              aria-label={`Delete ${line.item_name}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </td>
      </tr>
      
      {/* Desktop History Row */}
      {isOpenHistory && (
        <tr>
          <td colSpan="6" className="p-0 border-b border-border">
            <div className="bg-primary/5 p-4 shadow-inner">
               {isHistoryLoading ? (
                <div className="animate-pulse text-muted-foreground text-sm">Loading history...</div>
              ) : historyError ? (
                <div className="text-red-500 text-sm font-medium">Error: {historyError.message}</div>
              ) : tradingHistory?.length > 0 ? (
                <div className="h-auto max-h-[400px] overflow-y-auto block border border-border rounded bg-card">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-muted/50 border-b border-border text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Type</th>
                        <th className="px-3 py-2 font-medium">Invoice #</th>
                        <th className="px-3 py-2 font-medium">Date</th>
                        <th className="px-3 py-2 font-medium text-right">Qty</th>
                        <th className="px-3 py-2 font-medium text-right">Unit Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {tradingHistory.map((hist, hIdx) => (
                        <tr key={hIdx} className="hover:bg-muted/20">
                          <td className="px-3 py-1.5 font-medium">{hist.transaction_type}</td>
                          <td className="px-3 py-1.5 text-muted-foreground">{hist.invoice_number}</td>
                          <td className="px-3 py-1.5 text-muted-foreground">{new Date(hist.invoice_date).toLocaleDateString()}</td>
                          <td className="px-3 py-1.5 font-mono text-right">{hist.quantity}</td>
                          <td className="px-3 py-1.5 font-mono text-right">NPR {Number(hist.unit_price).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-muted-foreground text-sm italic">No recent history found for this item.</div>
              )}
            </div>
          </td>
        </tr>
      )}
    </React.Fragment>
  );
}, (prev, next) => {
  // Deep-ish equality for the row to prevent unnecessary re-renders during rapid typing
  return (
    prev.line === next.line &&
    prev.isOpenHistory === next.isOpenHistory &&
    (prev.isOpenHistory ? prev.tradingHistory === next.tradingHistory : true) &&
    (prev.isOpenHistory ? prev.isHistoryLoading === next.isHistoryLoading : true) &&
    prev.items === next.items
  );
});

export default function LineItemsEditor({ value = [], onChange, taxTypes = [], hideTotals = false }) {
  // Hydrate UUIDs safely so we have stable keys for React and DOM queries
  useMemo(() => {
    value.forEach(l => {
      if (!l.lineKey) l.lineKey = crypto.randomUUID();
    });
  }, [value]);

  // Shadow the value array in a ref for our stable callbacks to prevent stale-closure loops
  const valueRef = useRef(value);
  valueRef.current = value;
  
  // Trading History State
  const [openHistoryRowKey, setOpenHistoryRowKey] = useState(null);
  const [historyItemId, setHistoryItemId] = useState(null);
  const { data: tradingHistory, isLoading: isHistoryLoading, error: historyError } = useItemTradingHistory(historyItemId);

  // SWR Queries
  const { data: items = [] } = useItemsQuery();
  const { data: settings } = useSettingsQuery();

  // Mobile Drawer State
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState('add');
  const [drawerEditKey, setDrawerEditKey] = useState(null);
  const [drawerForm, setDrawerForm] = useState({ ...emptyLine });
  const firstInputRef = useRef(null);

  const computeLineTaxAmount = useCallback((line, overrideTaxTypeIds) => {
    const ids = overrideTaxTypeIds ?? line.tax_type_ids ?? [];
    if (ids.length === 0 && !line.vat_applicable) return 0;
    const effectiveIds = ids.length > 0 ? ids : [(taxTypes.find(t => t.is_default) || taxTypes[0])?.id].filter(Boolean);
    const { totalTaxAmount } = computeItemTaxes(line.line_total || 0, effectiveIds, taxTypes);
    return totalTaxAmount;
  }, [taxTypes]);

  // --- STABLE CALLBACKS ---
  const updateLine = useCallback((lineKey, patch) => {
    const prev = valueRef.current;
    
    // We recreate the array and only mutate the target line
    const updated = prev.map(l => {
      if (l.lineKey !== lineKey) return l;
      
      const newLine = { ...l, ...patch };
      
      // Auto-compute totals and item lookups
      if ('quantity' in patch || 'unit_price' in patch) {
        newLine.line_total = (newLine.quantity || 0) * (newLine.unit_price || 0);
      }
      
      if ('item_id' in patch) {
        const found = items.find(i => i.id === patch.item_id);
        if (found) {
          const taxIds = Array.isArray(found.tax_type_ids) ? found.tax_type_ids : (found.tax_type_ids ? JSON.parse(found.tax_type_ids) : []);
          newLine.item_name = found.item_name;
          newLine.item_code = found.item_code || '';
          newLine.hs_code = found.hs_code || '';
          newLine.quantity = newLine.quantity || 1;
          newLine.unit_price = found.selling_price || found.purchase_price || 0;
          newLine.vat_applicable = found.is_vat_applicable || taxIds.length > 0;
          newLine.tax_type_ids = taxIds;
          newLine.line_total = newLine.quantity * newLine.unit_price;
        }
      }
      newLine.tax_amount = computeLineTaxAmount(newLine);
      return newLine;
    });
    
    onChange(updated);
  }, [items, computeLineTaxAmount, onChange]);

  const removeLine = useCallback((lineKey) => {
    const prev = valueRef.current;
    const itemToRemove = prev.find(l => l.lineKey === lineKey);
    const idx = prev.findIndex(l => l.lineKey === lineKey);
    const newArr = prev.filter(l => l.lineKey !== lineKey);
    
    onChange(newArr);
    
    toast("Item deleted", {
      action: {
        label: "Undo",
        onClick: () => {
          const currentLines = valueRef.current;
          const restoredArr = [...currentLines];
          restoredArr.splice(idx, 0, itemToRemove);
          onChange(restoredArr);
        }
      }
    });
  }, [onChange]);

  const addLine = useCallback(() => {
    onChange([...valueRef.current, { ...emptyLine, lineKey: crypto.randomUUID() }]);
  }, [onChange]);

  const toggleHistory = useCallback((lineKey, itemId) => {
    if (openHistoryRowKey === lineKey) {
      setOpenHistoryRowKey(null);
      setHistoryItemId(null);
    } else {
      setOpenHistoryRowKey(lineKey);
      setHistoryItemId(itemId);
    }
  }, [openHistoryRowKey]);

  // --- GRID KEYBOARD TRAVERSAL ---
  const handleGridKeyDown = useCallback((e) => {
    const cell = e.target.closest('[data-row]');
    if (!cell) return;
    
    const rowKey = cell.dataset.row;
    const col = cell.dataset.col;
    const lines = valueRef.current;
    const rowIndex = lines.findIndex(l => l.lineKey === rowKey);
    
    if (rowIndex < 0) return;

    if (e.key === 'Enter') {
      // Allow SearchableSelect to natively open on Enter if empty
      if (col === 'item_id' && !lines[rowIndex].item_id && !e.shiftKey) return;
      
      e.preventDefault();
      
      const nextCol = col === 'item_id' ? 'quantity' : (col === 'quantity' ? 'unit_price' : null);
      if (nextCol) {
        document.querySelector(`[data-row="${rowKey}"][data-col="${nextCol}"]`)?.focus();
      } else {
        // We're at the end of the row
        if (rowIndex === lines.length - 1) {
          addLine();
          // Focus new row asynchronously after React renders
          setTimeout(() => {
            const currentLines = valueRef.current;
            const newRowKey = currentLines[currentLines.length - 1]?.lineKey;
            if (newRowKey) {
              document.querySelector(`[data-row="${newRowKey}"][data-col="item_id"]`)?.focus();
            }
          }, 50);
        } else {
          document.querySelector(`[data-row="${lines[rowIndex+1].lineKey}"][data-col="item_id"]`)?.focus();
        }
      }
    } else if (e.key === 'ArrowDown') {
      if (rowIndex < lines.length - 1) {
        e.preventDefault();
        document.querySelector(`[data-row="${lines[rowIndex+1].lineKey}"][data-col="${col}"]`)?.focus();
      }
    } else if (e.key === 'ArrowUp') {
      if (rowIndex > 0) {
        e.preventDefault();
        document.querySelector(`[data-row="${lines[rowIndex-1].lineKey}"][data-col="${col}"]`)?.focus();
      }
    }
  }, [addLine]);

  // Mobile Drawer Helpers
  const openMobileAdd = () => {
    setDrawerMode('add');
    setDrawerEditKey(null);
    setDrawerForm({ ...emptyLine, lineKey: crypto.randomUUID() });
    setIsDrawerOpen(true);
  };

  const openMobileEdit = (lineKey) => {
    const target = value.find(l => l.lineKey === lineKey);
    if (!target) return;
    setDrawerMode('edit');
    setDrawerEditKey(lineKey);
    setDrawerForm({ ...target });
    setIsDrawerOpen(true);
  };

  const handleDrawerFieldChange = (field, val) => {
    setDrawerForm(prev => {
      const updated = { ...prev, [field]: val };
      if (field === 'quantity' || field === 'unit_price') {
        updated.line_total = (updated.quantity || 0) * (updated.unit_price || 0);
      }
      if (field === 'item_id') {
        const found = items.find(i => i.id === val);
        if (found) {
          const taxIds = Array.isArray(found.tax_type_ids) ? found.tax_type_ids : (found.tax_type_ids ? JSON.parse(found.tax_type_ids) : []);
          updated.item_name = found.item_name;
          updated.item_code = found.item_code || '';
          updated.hs_code = found.hs_code || '';
          updated.quantity = updated.quantity || 1;
          updated.unit_price = found.selling_price || found.purchase_price || 0;
          updated.vat_applicable = found.is_vat_applicable || taxIds.length > 0;
          updated.tax_type_ids = taxIds;
          updated.line_total = updated.quantity * updated.unit_price;
        }
      }
      updated.tax_amount = computeLineTaxAmount(updated);
      return updated;
    });
  };

  const saveDrawerItem = () => {
    if (!drawerForm.item_id && !drawerForm.item_name) {
      toast.error('Please select or enter an item name');
      return false;
    }
    if (drawerForm.quantity <= 0) {
      toast.error('Quantity must be greater than 0');
      return false;
    }
    
    if (drawerMode === 'add') {
      onChange([...valueRef.current, drawerForm]);
      toast.success(`Added ${drawerForm.item_name}`);
    } else {
      const newArr = valueRef.current.map(l => l.lineKey === drawerEditKey ? drawerForm : l);
      onChange(newArr);
      toast.success(`Updated ${drawerForm.item_name}`);
    }
    return true;
  };

  const handleSaveAndAddNext = (e) => {
    if (saveDrawerItem()) {
      setDrawerMode('add');
      setDrawerEditKey(null);
      setDrawerForm({ ...emptyLine, lineKey: crypto.randomUUID() });
      setTimeout(() => {
        firstInputRef.current?.focus();
      }, 0);
    }
  };

  const subtotal = value.reduce((s, l) => s + (l.line_total || 0), 0);
  const taxTotal = value.reduce((s, l) => s + (l.tax_amount || 0), 0);
  const grandTotal = subtotal + taxTotal;

  const taxLabel = (() => {
    const names = new Set();
    for (const line of value) {
      for (const id of (line.tax_type_ids || [])) {
        const tt = taxTypes.find(t => t.id === id);
        if (tt) names.add(`${tt.tax_name} (${tt.tax_rate}%)`);
      }
    }
    return names.size > 0 ? [...names].join(', ') : 'Tax';
  })();

  return (
    <div className="space-y-3">
      {/* --- DESKTOP VIEW --- */}
      <div className="hidden md:block bg-muted/30 rounded-lg overflow-visible border border-border">
        <table className="w-full text-sm table-fixed min-w-[700px]">
          <thead>
            <tr className="bg-muted/70 border-b border-border">
              <th className="cell-density text-left font-medium text-muted-foreground">Item</th>
              <th className="cell-density text-left font-medium text-muted-foreground w-24">Qty</th>
              <th className="cell-density text-left font-medium text-muted-foreground w-36">Unit Price</th>
              <th className="cell-density text-center font-medium text-muted-foreground w-28">Tax</th>
              <th className="cell-density text-right font-medium text-muted-foreground w-36">Net Total</th>
              <th className="cell-density w-14" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border" onKeyDown={handleGridKeyDown}>
            {value.map((line) => (
              <LineItemRow
                key={line.lineKey}
                line={line}
                items={items}
                taxTypes={taxTypes}
                updateLine={updateLine}
                removeLine={removeLine}
                isOpenHistory={openHistoryRowKey === line.lineKey}
                toggleHistory={toggleHistory}
                settings={settings}
                isHistoryLoading={isHistoryLoading}
                historyError={historyError}
                tradingHistory={tradingHistory}
              />
            ))}
            {value.length === 0 && (
              <tr><td colSpan={6} className="cell-density text-center text-muted-foreground text-sm">No items added yet. Click "Add Line" below.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* --- MOBILE VIEW --- */}
      <div className="md:hidden space-y-3">
        {value.length > 0 ? (
          <ul className="space-y-3">
            {value.map((line) => (
              <li key={line.lineKey} className="bg-card border border-border rounded-xl shadow-sm flex items-stretch overflow-hidden">
                <div className="flex-1 p-3 cursor-pointer" onClick={() => openMobileEdit(line.lineKey)}>
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-semibold text-sm line-clamp-1 pr-2">{line.item_name || 'Unnamed Item'}</span>
                    <span className="font-medium text-sm whitespace-nowrap">NPR {Number(line.line_total || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-muted-foreground">
                    <span>Qty: {line.quantity} × {Number(line.unit_price).toLocaleString()}</span>
                    {line.tax_amount > 0 && <span>+ Tax {Number(line.tax_amount).toLocaleString()}</span>}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={`Delete ${line.item_name}`}
                  className="w-[44px] border-l border-border flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors active:bg-red-100 touch-target shrink-0"
                  onClick={(e) => { e.stopPropagation(); removeLine(line.lineKey); }}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-center p-6 border border-dashed rounded-xl text-sm text-muted-foreground">
            No items added yet.
          </div>
        )}
      </div>

      <div className="flex justify-between items-start">
        <Button variant="outline" size="sm" onClick={() => { addLine(); if (window.innerWidth < 768) openMobileAdd(); }} className="md:flex hidden">
          <Plus className="w-4 h-4 mr-1" /> Add Line
        </Button>
        <Button variant="outline" size="sm" onClick={openMobileAdd} className="md:hidden flex w-full justify-center py-5 rounded-xl border-dashed">
          <Plus className="w-4 h-4 mr-1" /> Add Item
        </Button>
        
        {!hideTotals && (
          <div className="text-right space-y-3 text-sm bg-card p-5 rounded-xl border border-stone-200 shadow-sm md:w-72 w-full mt-4 md:mt-0">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground font-medium">Subtotal</span>
              <span className="font-semibold">NPR {subtotal.toLocaleString()}</span>
            </div>
            {taxTotal > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground font-medium">{taxLabel}</span>
                <span className="font-semibold">NPR {taxTotal.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between items-center text-lg font-bold border-t border-stone-100 pt-3 mt-3">
              <span>Grand Total</span>
              <span className="text-primary">NPR {grandTotal.toLocaleString()}</span>
            </div>
          </div>
        )}
      </div>

      {/* MOBILE DRAWER */}
      <Drawer open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
        <DrawerContent className="max-h-[90dvh]">
          <span className="sr-only" aria-live="polite">
             {drawerMode === 'add' ? 'Add new item form opened' : 'Edit item form opened'}
          </span>
          <DrawerHeader className="border-b text-left">
            <DrawerTitle>{drawerMode === 'add' ? 'Add Line Item' : 'Edit Line Item'}</DrawerTitle>
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase">Item / Product</label>
              <div ref={firstInputRef} tabIndex={-1} className="outline-none">
                <SearchableSelect
                  value={drawerForm.item_id}
                  onValueChange={v => handleDrawerFieldChange('item_id', v)}
                  options={items.map(i => ({ value: i.id, label: i.item_name, sub: i.item_code || i.unit_of_measure, code: i.item_code, unit: i.unit_of_measure }))}
                  placeholder="Select item..."
                  className="w-full h-10 text-base"
                />
              </div>
              {!drawerForm.item_id && drawerForm.item_name && (
                <Input value={drawerForm.item_name} onChange={e => handleDrawerFieldChange('item_name', e.target.value)} placeholder="Item name" className="mt-2 text-base h-10" />
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase">Quantity</label>
                <Input 
                  type="text" 
                  inputMode="decimal"
                  value={drawerForm.quantity} 
                  onChange={e => {
                     const val = e.target.value;
                     handleDrawerFieldChange('quantity', val === '' ? '' : (parseFloat(val) || 0));
                  }} 
                  className="text-base h-10" 
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase">Unit Price</label>
                <Input 
                  type="text" 
                  inputMode="decimal"
                  value={drawerForm.unit_price} 
                  onChange={e => {
                     const val = e.target.value;
                     handleDrawerFieldChange('unit_price', val === '' ? '' : (parseFloat(val) || 0));
                  }} 
                  className="text-base h-10" 
                />
              </div>
            </div>
            
            <div className="bg-muted/30 p-3 rounded-lg border border-border mt-2 space-y-1 text-sm">
               <div className="flex justify-between text-muted-foreground">
                 <span>Tax</span>
                 <span>NPR {Number(drawerForm.tax_amount || 0).toLocaleString()}</span>
               </div>
               <div className="flex justify-between font-bold text-foreground text-base pt-1">
                 <span>Line Total</span>
                 <span>NPR {Number(drawerForm.line_total || 0).toLocaleString()}</span>
               </div>
            </div>
          </div>
          
          <DrawerFooter className="border-t flex flex-row justify-end gap-2 pt-4">
            <Button variant="ghost" onClick={() => setIsDrawerOpen(false)} className="mr-auto">Cancel</Button>
            {drawerMode === 'add' && (
              <Button 
                variant="outline" 
                onPointerDown={(e) => e.preventDefault()} 
                onClick={handleSaveAndAddNext}
              >
                Save & Add Next
              </Button>
            )}
            <Button onClick={() => { if(saveDrawerItem()) setIsDrawerOpen(false); }}>
              Save
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
