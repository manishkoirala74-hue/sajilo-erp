import React, { useState, useEffect } from 'react';
import { sajilo, supabase } from '@/api/sajiloClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Layers } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import { useForm, useFieldArray } from 'react-hook-form';
import DateInput from '@/components/shared/DateInput';

export default function StockAssemblyForm({ assemblyId, onClose, onSaved }) {
  const { user, activeCompany, globalSettings, hasAccess } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showNegativeStockWarning, setShowNegativeStockWarning] = useState(false);
  const [negativeStockItems, setNegativeStockItems] = useState([]);
  const [pendingSubmitData, setPendingSubmitData] = useState(null);
  const [items, setItems] = useState([]);
  const [godowns, setGodowns] = useState([]);

  const { register, control, handleSubmit, reset, watch, setValue } = useForm({
    defaultValues: {
      assembly_no: `ASM-${Date.now().toString().slice(-6)}`,
      assembly_date: new Date().toISOString().split('T')[0],
      godown_id: '',
      overhead_cost: 0,
      notes: '',
      lineItems: [
        { item_id: '', line_type: 'Consumed', quantity: 1, unit_cost: 0 },
        { item_id: '', line_type: 'Produced', quantity: 1, unit_cost: 0 }
      ]
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'lineItems'
  });

  const watchLines = watch('lineItems');
  const watchOverhead = watch('overhead_cost');

  useEffect(() => {
    fetchDependencies();
    if (assemblyId) {
      loadAssembly(assemblyId);
    }
  }, [assemblyId]);

  const fetchDependencies = async () => {
    try {
      const [gList, iList] = await Promise.all([
        sajilo.entities.Godown.list(),
        sajilo.entities.Item.list()
      ]);
      setGodowns(gList);
      setItems(iList);
    } catch (e) {
      toast.error('Failed to load dependencies');
    }
  };

  const loadAssembly = async (id) => {
    try {
      setLoading(true);
      const data = await sajilo.entities.StockAssembly.getById(id);
      const linesData = await supabase.from('StockAssemblyItem').select('*').eq('assembly_id', id);
      
      reset({
        ...data,
        lineItems: linesData.data || []
      });
    } catch (e) {
      toast.error('Failed to load assembly');
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data, isComplete = false) => {
    if (!data.godown_id) {
      toast.error('Please select a godown');
      return;
    }

    if (isComplete && globalSettings?.negative_stock_policy === 'WARN_AND_ALLOW' && !data._skipStockCheck) {
      try {
        const consumedItems = data.lineItems.filter(l => l.line_type === 'Consumed' && l.item_id);
        if (consumedItems.length > 0) {
          const itemIds = consumedItems.map(l => l.item_id);
          const stockData = await sajilo.entities.CurrentStock.filter({ godown_id: data.godown_id, item_id: `in.(${itemIds.join(',')})` });
          const negatives = [];
          
          consumedItems.forEach(line => {
            const stockRec = stockData.find(s => s.item_id === line.item_id);
            const curQty = stockRec ? parseFloat(stockRec.current_qty) : 0;
            const dispatchQty = parseFloat(line.quantity || 0);
            if (curQty - dispatchQty < 0) {
              const itemObj = items.find(i => i.id === line.item_id);
              negatives.push({ name: itemObj?.name || 'Unknown Item', deficit: Math.abs(curQty - dispatchQty) });
            }
          });
          
          if (negatives.length > 0) {
            setNegativeStockItems(negatives);
            setPendingSubmitData(data);
            setShowNegativeStockWarning(true);
            return;
          }
        }
      } catch (e) {
        console.error("Stock check failed", e);
      }
    }

    setLoading(true);
    try {
      const status = isComplete ? 'Completed' : 'Draft';
      
      // We call the RPC create_or_update_stock_assembly
      const { data: resultId, error: rpcError } = await supabase.rpc('create_or_update_stock_assembly', {
        p_assembly_id: assemblyId || null,
        p_company_id: activeCompany?.id || user.company_id,
        p_assembly_no: data.assembly_no,
        p_godown_id: data.godown_id,
        p_assembly_date: data.assembly_date,
        p_overhead_cost: Number(data.overhead_cost || 0),
        p_status: status,
        p_notes: data.notes,
        p_items: data.lineItems.map(l => ({
           id: l.id || undefined,
           item_id: l.item_id,
           line_type: l.line_type,
           quantity: Number(l.quantity),
           unit_cost: Number(l.unit_cost || 0)
        }))
      });

      if (rpcError) throw rpcError;

      if (isComplete) {
         const { error: completeError } = await supabase.rpc('complete_stock_assembly', {
             p_assembly_id: resultId,
             p_company_id: activeCompany?.id || user.company_id
         });
         if (completeError) throw completeError;
         toast.success('Stock Assembly Completed and Posted!');
      } else {
         toast.success('Stock Assembly Draft Saved!');
      }

      onSaved();
    } catch (e) {
      toast.error(e.message || 'Failed to save assembly');
    } finally {
      setLoading(false);
    }
  };

  // Calculate realtime totals
  const totalConsumed = watchLines.reduce((acc, curr) => curr.line_type === 'Consumed' ? acc + (curr.quantity * curr.unit_cost) : acc, 0);
  const totalWastage = watchLines.reduce((acc, curr) => curr.line_type === 'Wastage' ? acc + (curr.quantity * curr.unit_cost) : acc, 0);
  const producedQty = watchLines.reduce((acc, curr) => curr.line_type === 'Produced' ? acc + Number(curr.quantity) : acc, 0);
  const calculatedCost = producedQty > 0 ? (totalConsumed + totalWastage + Number(watchOverhead || 0)) / producedQty : 0;

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-500" />
            {assemblyId ? 'Edit Stock Assembly' : 'New Stock Assembly'}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Assembly No *</Label>
              <Input {...register('assembly_no')} />
            </div>
            <div>
              <Label>Date *</Label>
              <DateInput value={watch('assembly_date')} onChange={val => setValue('assembly_date', val)} />
            </div>
            <div>
              <Label>Godown *</Label>
              <Select onValueChange={v => setValue('godown_id', v)} value={watch('godown_id')}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Godown" />
                </SelectTrigger>
                <SelectContent>
                  {godowns.map(g => (
                    <SelectItem key={g.id} value={g.id}>{g.name || g.godown_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="border rounded-lg p-4 bg-slate-50 dark:bg-slate-900/50">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Line Items</h3>
              <Button type="button" variant="outline" size="sm" onClick={() => append({ item_id: '', line_type: 'Consumed', quantity: 1, unit_cost: 0 })}>
                <Plus className="w-4 h-4 mr-2" /> Add Item
              </Button>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium">Type</th>
                  <th className="pb-2 font-medium">Item</th>
                  <th className="pb-2 font-medium">Qty</th>
                  <th className="pb-2 font-medium">Unit Cost</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {fields.map((field, index) => (
                  <tr key={field.id} className="border-b last:border-0">
                    <td className="py-2 pr-2">
                      <Select 
                        onValueChange={v => setValue(`lineItems.${index}.line_type`, v)} 
                        value={watchLines[index]?.line_type || 'Consumed'}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Consumed">Consumed</SelectItem>
                          <SelectItem value="Produced">Produced</SelectItem>
                          <SelectItem value="Wastage">Wastage</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-2 pr-2">
                      <Select 
                        onValueChange={v => {
                           setValue(`lineItems.${index}.item_id`, v);
                           // Auto-fill cost for consumed if needed (simplification)
                           const item = items.find(i => i.id === v);
                           if (item && watchLines[index]?.line_type !== 'Produced') {
                               setValue(`lineItems.${index}.unit_cost`, item.purchase_price || 0);
                           }
                        }} 
                        value={watchLines[index]?.item_id}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select Item" />
                        </SelectTrigger>
                        <SelectContent>
                          {items.map(i => (
                            <SelectItem key={i.id} value={i.id}>{i.item_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-2 pr-2 w-24">
                      <Input type="number" step="0.01" {...register(`lineItems.${index}.quantity`)} />
                    </td>
                    <td className="py-2 pr-2 w-32">
                       <Input type="number" step="0.01" {...register(`lineItems.${index}.unit_cost`)} disabled={watchLines[index]?.line_type === 'Produced'} />
                    </td>
                    <td className="py-2 w-10">
                      <Button type="button" variant="ghost" size="icon" className="text-red-500" onClick={() => remove(index)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-2 gap-8 bg-indigo-50 dark:bg-indigo-950/20 p-4 rounded-lg">
             <div className="space-y-4">
                <div>
                  <Label>Assembly Overhead (Labor/Utilities)</Label>
                  <Input type="number" step="0.01" {...register('overhead_cost')} />
                </div>
                <div>
                  <Label>Notes</Label>
                  <Input {...register('notes')} />
                </div>
             </div>
             <div className="flex flex-col justify-center items-end space-y-2">
                 <div className="text-sm text-slate-500">Materials Cost: <span className="font-semibold text-slate-900 dark:text-slate-100">{(totalConsumed + totalWastage).toLocaleString()}</span></div>
                 <div className="text-sm text-slate-500">Overhead Cost: <span className="font-semibold text-slate-900 dark:text-slate-100">{Number(watchOverhead || 0).toLocaleString()}</span></div>
                 <div className="text-lg font-bold text-indigo-700 dark:text-indigo-400">Produced Unit Cost: {calculatedCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
             </div>
          </div>

        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleSubmit((data) => onSubmit(data, false))} disabled={loading}>
              Save as Draft
            </Button>
            <Button onClick={handleSubmit((data) => onSubmit(data, true))} disabled={loading}>
              Complete Assembly
            </Button>
          </div>
          </DialogFooter>
      </DialogContent>

      {/* ── NEGATIVE STOCK WARNING DIALOG ── */}
      <Dialog open={showNegativeStockWarning} onOpenChange={() => { setShowNegativeStockWarning(false); setPendingSubmitData(null); }}>
        <DialogContent className="max-w-md" style={{ zIndex: 10000 }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Layers className="w-5 h-5" /> Negative Stock Warning
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 text-sm text-muted-foreground space-y-2">
            <p>This assembly will result in negative stock for the following consumed items:</p>
            <ul className="list-disc pl-5 space-y-1 text-red-600 font-medium">
              {negativeStockItems.map((n, idx) => (
                <li key={idx}>{n.name} (Shortfall: {n.deficit})</li>
              ))}
            </ul>
            {hasAccess('inventory', 'override_negative_stock') ? (
              <p className="mt-4 font-semibold text-foreground">Do you wish to proceed and allow negative stock?</p>
            ) : (
              <p className="mt-4 font-bold text-red-600">You do not have permission to override negative stock. Please contact an Inventory Manager.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowNegativeStockWarning(false); setPendingSubmitData(null); }}>Cancel</Button>
            {hasAccess('inventory', 'override_negative_stock') && (
              <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={() => { 
                setShowNegativeStockWarning(false); 
                onSubmit({ ...pendingSubmitData, _skipStockCheck: true }, true); 
              }}>
                Acknowledge & Proceed
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
