import React, { useState, useEffect, useRef } from 'react';
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

export default function LineItemsEditor({ value = [], onChange, taxTypes = [], hideTotals = false }) {
  const [activeLineIdx, setActiveLineIdx] = useState(null);
  
  // Trading History State
  const [openHistoryRowIdx, setOpenHistoryRowIdx] = useState(null);
  const [historyItemId, setHistoryItemId] = useState(null);
  const { data: tradingHistory, isLoading: isHistoryLoading, error: historyError } = useItemTradingHistory(historyItemId);

  // SWR Queries
  const { data: items = [] } = useItemsQuery();
  const { data: settings } = useSettingsQuery();

  // Mobile Drawer State
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState('add'); // 'add' or 'edit'
  const [drawerEditIdx, setDrawerEditIdx] = useState(null);
  const [drawerForm, setDrawerForm] = useState({ ...emptyLine });
  const firstInputRef = useRef(null);

  const computeLineTaxAmount = (line, overrideTaxTypeIds) => {
    const ids = overrideTaxTypeIds ?? line.tax_type_ids ?? [];
    if (ids.length === 0 && !line.vat_applicable) return 0;
    const effectiveIds = ids.length > 0 ? ids : [(taxTypes.find(t => t.is_default) || taxTypes[0])?.id].filter(Boolean);
    const { totalTaxAmount } = computeItemTaxes(line.line_total || 0, effectiveIds, taxTypes);
    return totalTaxAmount;
  };

  const updateLine = (idx, field, val) => {
    const updated = [...value];
    updated[idx] = { ...updated[idx], [field]: val };

    if (field === 'quantity' || field === 'unit_price') {
      updated[idx].line_total = (updated[idx].quantity || 0) * (updated[idx].unit_price || 0);
    }

    if (field === 'item_id') {
      const found = items.find(i => i.id === val);
      if (found) {
        const taxIds = Array.isArray(found.tax_type_ids) ? found.tax_type_ids : (found.tax_type_ids ? JSON.parse(found.tax_type_ids) : []);
        updated[idx].item_name = found.item_name;
        updated[idx].item_code = found.item_code || '';
        updated[idx].hs_code = found.hs_code || '';
        updated[idx].quantity = updated[idx].quantity || 1;
        updated[idx].unit_price = found.selling_price || found.purchase_price || 0;
        updated[idx].vat_applicable = found.is_vat_applicable || taxIds.length > 0;
        updated[idx].tax_type_ids = taxIds;
        updated[idx].line_total = updated[idx].quantity * updated[idx].unit_price;
      }
    }
    updated[idx].tax_amount = computeLineTaxAmount(updated[idx]);
    onChange(updated);
  };

  const addLine = () => onChange([...value, { ...emptyLine }]);
  
  const removeLine = (idx) => {
    const itemToRemove = value[idx];
    const newArr = value.filter((_, i) => i !== idx);
    onChange(newArr);
    
    // Undo Toast
    toast("Item deleted", {
      action: {
        label: "Undo",
        onClick: () => {
          const restoredArr = [...newArr];
          restoredArr.splice(idx, 0, itemToRemove);
          onChange(restoredArr);
        }
      }
    });
  };

  // Mobile Drawer Helpers
  const openMobileAdd = () => {
    setDrawerMode('add');
    setDrawerEditIdx(null);
    setDrawerForm({ ...emptyLine });
    setIsDrawerOpen(true);
  };

  const openMobileEdit = (idx) => {
    setDrawerMode('edit');
    setDrawerEditIdx(idx);
    setDrawerForm({ ...value[idx] });
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
    // Simple validation block
    if (drawerForm.quantity <= 0) {
      toast.error('Quantity must be greater than 0');
      return false;
    }
    
    if (drawerMode === 'add') {
      onChange([...value, drawerForm]);
      toast.success(`Added ${drawerForm.item_name}`);
    } else {
      const newArr = [...value];
      newArr[drawerEditIdx] = drawerForm;
      onChange(newArr);
      toast.success(`Updated ${drawerForm.item_name}`);
    }
    return true;
  };

  const handleSaveAndAddNext = (e) => {
    // onPointerDown preventing default focus shifting on the button
    if (saveDrawerItem()) {
      setDrawerMode('add');
      setDrawerEditIdx(null);
      setDrawerForm({ ...emptyLine });
      // Wait for React to render the cleared form, then focus (still useful for screenreaders or fallback)
      // Though on iOS the key is that onPointerDown prevented focus loss entirely
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
      <div className="hidden md:block bg-muted/30 rounded-lg overflow-x-auto border border-border">
        {/* We keep the original desktop table structure here */}
        <table className="table-fluid-grid text-sm">
          <thead>
            <tr className="bg-muted/70 border-b border-border">
              <th className="cell-density text-left font-medium text-muted-foreground">Item</th>
              <th className="cell-density text-left font-medium text-muted-foreground w-20">Qty</th>
              <th className="cell-density text-left font-medium text-muted-foreground w-32">Unit Price</th>
              <th className="cell-density text-center font-medium text-muted-foreground w-20">Tax</th>
              <th className="cell-density text-right font-medium text-muted-foreground w-28">Net Total</th>
              <th className="cell-density w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {value.map((line, idx) => {
              const appliedTaxes = (line.tax_type_ids || []).map(id => taxTypes.find(t => t.id === id)).filter(Boolean).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
              return (
                <React.Fragment key={idx}>
                <tr className="border-b border-stone-100 last:border-0">
                  <td className="cell-density">
                    <SearchableSelect
                      value={line.item_id}
                      onValueChange={v => updateLine(idx, 'item_id', v)}
                      options={items.map(i => ({ value: i.id, label: i.item_name, sub: i.item_code || i.unit_of_measure, code: i.item_code, unit: i.unit_of_measure }))}
                      placeholder="Select item..."
                      className="w-full h-8 text-sm bg-card"
                      onCreateNew={() => window.open('/inventory/items/new', '_blank')}
                      createNewText="New Item"
                    />
                    {!line.item_id && line.item_name && (
                      <Input value={line.item_name} onChange={e => updateLine(idx, 'item_name', e.target.value)} placeholder="Item name" className="mt-1 h-7 text-sm" />
                    )}
                  </td>
                  <td className="cell-density">
                    <Input type="number" min="0" value={line.quantity} onChange={e => updateLine(idx, 'quantity', parseFloat(e.target.value) || 0)} className="h-8 text-sm" />
                  </td>
                  <td className="cell-density">
                    <Input type="number" min="0" step="0.01" value={line.unit_price} onChange={e => updateLine(idx, 'unit_price', parseFloat(e.target.value) || 0)} className="h-8 text-sm" />
                  </td>
                  <td className="cell-density text-center">
                    {appliedTaxes.length > 0 ? (
                      <div className="flex flex-col items-center gap-0.5">
                        {appliedTaxes.map(tt => (
                          <span key={tt.id} className="text-xs font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded whitespace-nowrap">{tt.tax_rate}%{tt.is_compound ? '⊕' : ''}</span>
                        ))}
                        {line.tax_amount > 0 && <span className="text-xs text-muted-foreground tabular-nums">+{line.tax_amount.toLocaleString()}</span>}
                      </div>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="cell-density text-right font-medium">NPR {Number(line.line_total || 0).toLocaleString()}</td>
                  <td className="cell-density">
                    <div className="flex items-center gap-1">
                      {settings?.show_recent_trading_history !== false && line.item_id && (
                        <Button variant="ghost" size="sm" className={`h-7 px-2 text-xs ${openHistoryRowIdx === idx ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`} onClick={(e) => { e.preventDefault(); if (openHistoryRowIdx === idx) { setOpenHistoryRowIdx(null); setHistoryItemId(null); } else { setOpenHistoryRowIdx(idx); setHistoryItemId(line.item_id); } }}>History</Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600" onClick={() => removeLine(idx)} aria-label={`Delete ${line.item_name}`}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </td>
                </tr>
                {/* Desktop History Row (unchanged) */}
                {openHistoryRowIdx === idx && historyItemId && line.item_id === historyItemId && (
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
            })}
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
            {value.map((line, idx) => (
              <li key={idx} className="bg-card border border-border rounded-xl shadow-sm flex items-stretch overflow-hidden">
                <div className="flex-1 p-3 cursor-pointer" onClick={() => openMobileEdit(idx)}>
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-semibold text-sm line-clamp-1 pr-2">{line.item_name || 'Unnamed Item'}</span>
                    <span className="font-medium text-sm whitespace-nowrap">NPR {Number(line.line_total || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-muted-foreground">
                    <span>Qty: {line.quantity} × {Number(line.unit_price).toLocaleString()}</span>
                    {line.tax_amount > 0 && <span>+ Tax {Number(line.tax_amount).toLocaleString()}</span>}
                  </div>
                </div>
                {/* 44x44 Touch Target for Delete */}
                <button
                  type="button"
                  aria-label={`Delete ${line.item_name}`}
                  className="w-[44px] border-l border-border flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors active:bg-red-100 touch-target shrink-0"
                  onClick={(e) => { e.stopPropagation(); removeLine(idx); }}
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
              {/* Force the ref onto the SearchableSelect's inner input if possible, 
                  or if it doesn't forward ref properly, attach to a wrapping div */}
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
                     // Allow empty string for backspacing
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
