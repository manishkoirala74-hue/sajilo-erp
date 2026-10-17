import React, { useState, useEffect, useMemo } from 'react';
import { sajilo, supabase } from '@/api/sajiloClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Layers, Copy, AlertTriangle, CheckCircle2, History, Info } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import { useForm, useFieldArray } from 'react-hook-form';
import DateInput from '@/components/shared/DateInput';
import { useQuery } from '@tanstack/react-query';
import { queryClientInstance } from '@/lib/query-client';
import { useAmountFormatter } from '@/hooks/useAmountFormatter';
import { getPredictedVoucherNumber } from '@/utils/documentSequence';

// Discrete units that cannot physically exist in fractions
const DISCRETE_UOMS = new Set(['PCS', 'NOS', 'BOX', 'SET', 'UNIT', 'BAG', 'PKT', 'PAIR', 'ROLL', 'DOZEN']);

function calculateScaledQuantity(originalQty, scaleFactor, uom) {
  const cleanUom = (uom || 'PCS').trim().toUpperCase();
  const rawScaled = (Number(originalQty) || 0) * scaleFactor;
  if (DISCRETE_UOMS.has(cleanUom)) {
    return Math.max(1, Math.ceil(rawScaled));
  }
  return Number(rawScaled.toFixed(3));
}

export default function StockAssemblyForm({ assemblyId, onClose, onSaved }) {
  const { user, activeCompany } = useAuth();
  const { formatNumber } = useAmountFormatter();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [godowns, setGodowns] = useState([]);
  const [predictedNumber, setPredictedNumber] = useState('');
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [recentAssemblies, setRecentAssemblies] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [assemblyStatus, setAssemblyStatus] = useState('Draft');
  const [cancellationReason, setCancellationReason] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReasonInput, setCancelReasonInput] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const isLocked = assemblyStatus === 'Completed' || assemblyStatus === 'Cancelled';

  const companyId = activeCompany?.id || user?.company_id;

  const { register, control, handleSubmit, reset, watch, setValue } = useForm({
    defaultValues: {
      assembly_no: 'AUTO',
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

  const watchGodownId = watch('godown_id');
  const watchLines = watch('lineItems') || [];
  const watchOverhead = watch('overhead_cost');

  // TanStack Query in-memory cache for the selected Godown's CurrentStock snapshot
  const { data: stockMap = {}, isLoading: loadingStock } = useQuery({
    queryKey: ['CurrentStock', companyId, watchGodownId],
    queryFn: async () => {
      if (!watchGodownId || !companyId) return {};
      const { data, error } = await supabase
        .from('CurrentStock')
        .select('item_id, current_qty')
        .eq('godown_id', watchGodownId)
        .eq('company_id', companyId);
      if (error) throw error;
      const map = {};
      (data || []).forEach(row => { map[row.item_id] = Number(row.current_qty || 0); });
      return map;
    },
    enabled: !!watchGodownId && !!companyId,
    staleTime: 1000 * 60 * 5, // 5-minute memory cache
    refetchOnWindowFocus: false
  });

  const itemsMap = useMemo(() => new Map(items.map(i => [i.id, i])), [items]);

  useEffect(() => {
    fetchDependencies();
    if (assemblyId) {
      loadAssembly(assemblyId);
    }
  }, [assemblyId]);

  const fetchDependencies = async () => {
    try {
      const [gList, iList, seqConfigs, fyList, compSettings] = await Promise.all([
        sajilo.entities.Godown.list(),
        sajilo.entities.Item.list(),
        sajilo.entities.DocumentSequenceConfig.list(),
        sajilo.entities.FiscalYear.list(),
        sajilo.entities.CompanySettings.list()
      ]);
      setGodowns(gList || []);
      setItems(iList || []);

      // Auto-select first active or main godown if empty
      if (!watchGodownId && gList && gList.length > 0) {
        const mainG = gList.find(g => g.is_main) || gList[0];
        setValue('godown_id', mainG.id);
      }

      // Predicted sequence preview for new assemblies
      if (!assemblyId) {
        const today = new Date().toISOString().split('T')[0];
        const currentFy = (fyList || []).find(fy => fy.status === 'OPEN' || (today >= fy.start_date && today <= fy.end_date)) || fyList?.[0];
        const predicted = getPredictedVoucherNumber('StockAssembly', seqConfigs, currentFy, compSettings?.[0] || {});
        if (predicted) {
          setPredictedNumber(predicted);
        }
        setValue('assembly_no', 'AUTO');
      }
    } catch (e) {
      toast.error('Failed to load Godowns and Items');
    }
  };

  const loadAssembly = async (id) => {
    try {
      setLoading(true);
      const data = await sajilo.entities.StockAssembly.get(id);
      if (!data) {
        toast.error('Stock assembly not found');
        return;
      }
      const { data: linesData, error: linesErr } = await supabase.from('StockAssemblyItem').select('*').eq('assembly_id', id);
      if (linesErr) throw linesErr;
      
      setAssemblyStatus(data.status || 'Draft');
      setCancellationReason(data.cancellation_reason || '');

      reset({
        ...data,
        lineItems: (linesData && linesData.length > 0) ? linesData : [
          { item_id: '', line_type: 'Consumed', quantity: 1, unit_cost: 0 },
          { item_id: '', line_type: 'Produced', quantity: 1, unit_cost: 0 }
        ]
      });
    } catch (e) {
      console.error(e);
      toast.error('Failed to load assembly details');
    } finally {
      setLoading(false);
    }
  };

  // Fetch completed assemblies for the "Copy from Previous Assembly" feature
  const openTemplateModal = async () => {
    setShowTemplateModal(true);
    setLoadingTemplates(true);
    try {
      const { data, error } = await supabase
        .from('StockAssembly')
        .select('id, assembly_no, assembly_date, total_cost, overhead_cost, StockAssemblyItem(id, item_id, line_type, quantity, unit_cost)')
        .eq('company_id', companyId)
        .eq('status', 'Completed')
        .order('assembly_date', { ascending: false })
        .limit(15);
      if (error) throw error;
      setRecentAssemblies(data || []);
    } catch (e) {
      toast.error('Failed to load previous assemblies');
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handleCopyFromAssembly = (template) => {
    if (!template || !template.StockAssemblyItem) return;
    const templateItems = template.StockAssemblyItem;
    const prevProduced = templateItems.find(l => l.line_type === 'Produced');
    const prevProducedQty = Number(prevProduced?.quantity) || 1;

    const currentProduced = watchLines.find(l => l.line_type === 'Produced');
    const targetProducedQty = Number(currentProduced?.quantity) || prevProducedQty;
    const scaleFactor = targetProducedQty / (prevProducedQty || 1);

    const newLines = templateItems.map(l => {
      const itm = itemsMap.get(l.item_id);
      const uom = itm?.unit_of_measure || 'PCS';
      const scaledQty = l.line_type === 'Produced'
        ? targetProducedQty
        : calculateScaledQuantity(l.quantity, scaleFactor, uom);

      // Auto-populate raw material cost from current live WAC; keep scrap recovery cost as NRV
      const liveWac = (l.line_type === 'Consumed')
        ? (itm?.weighted_average_cost || itm?.current_unit_cost || itm?.purchase_price || 0)
        : l.unit_cost;

      return {
        item_id: l.item_id,
        line_type: l.line_type,
        quantity: scaledQty,
        unit_cost: liveWac
      };
    });

    setValue('lineItems', newLines);
    // Non-linear overhead isolation: reset overhead to 0 and prompt for actual batch input
    setValue('overhead_cost', 0);
    setShowTemplateModal(false);
    toast.success(`Copied recipe from ${template.assembly_no}. Batch overhead was reset—please enter actual overhead for this run.`);
  };

  // Stock check validation per line
  const getLineStockInfo = (line) => {
    if (!line?.item_id || !watchGodownId) return { available: 0, isBlocked: false, errorMsg: null };
    const available = Number(stockMap[line.item_id] ?? 0);
    const required = Number(line.quantity || 0);

    if (line.line_type === 'Consumed') {
      if (available <= 0) {
        return { available, isBlocked: true, errorMsg: 'Out of Stock (0.00)' };
      }
      if (required > available) {
        return { available, isBlocked: true, errorMsg: `Exceeds stock by ${(required - available).toFixed(2)}` };
      }
    }
    return { available, isBlocked: false, errorMsg: null };
  };

  // Global check: are there any stock deficits in Consumed lines?
  const stockErrors = useMemo(() => {
    const errors = [];
    watchLines.forEach((l, idx) => {
      if (l.line_type === 'Consumed' && l.item_id) {
        const info = getLineStockInfo(l);
        if (info.isBlocked) {
          const itm = itemsMap.get(l.item_id);
          errors.push({
            index: idx,
            name: itm?.item_name || 'Item',
            msg: info.errorMsg,
            available: info.available,
            required: l.quantity,
            uom: itm?.unit_of_measure || 'PCS'
          });
        }
      }
    });
    return errors;
  }, [watchLines, stockMap, itemsMap, watchGodownId]);

  const hasStockDeficit = stockErrors.length > 0;

  // Real-time Master Cost Calculation (Horngren-IFRS formula)
  const totalConsumed = watchLines.reduce((acc, curr) => curr.line_type === 'Consumed' ? acc + (Number(curr.quantity || 0) * Number(curr.unit_cost || 0)) : acc, 0);
  const totalScrapRecovery = watchLines.reduce((acc, curr) => (curr.line_type === 'Wastage' || curr.line_type === 'Wastage (Recovery)') ? acc + (Number(curr.quantity || 0) * Number(curr.unit_cost || 0)) : acc, 0);
  const producedQty = watchLines.reduce((acc, curr) => curr.line_type === 'Produced' ? acc + Number(curr.quantity || 0) : acc, 0);
  const totalProductionCost = Math.max(0, totalConsumed + Number(watchOverhead || 0) - totalScrapRecovery);
  const calculatedUnitCost = producedQty > 0 ? (totalProductionCost / producedQty) : 0;

  const onSubmit = async (data, isComplete = false) => {
    if (isLocked) {
      toast.error('This assembly is completed or cancelled and cannot be edited.');
      return;
    }

    if (!data.godown_id) {
      toast.error('Please select a Godown');
      return;
    }

    // Filter valid lines
    const validLines = (data.lineItems || []).filter(l => l.item_id && Number(l.quantity) > 0);
    const consumedLines = validLines.filter(l => l.line_type === 'Consumed');
    const producedLines = validLines.filter(l => l.line_type === 'Produced');

    if (producedLines.length === 0) {
      toast.error('Please specify at least one Produced item with a quantity greater than zero');
      return;
    }

    if (consumedLines.length === 0) {
      toast.error('Please specify at least one Consumed raw material with a quantity greater than zero');
      return;
    }

    // STRICT ZERO/NEGATIVE STOCK HARD BLOCK
    if (isComplete && hasStockDeficit) {
      const firstErr = stockErrors[0];
      toast.error(`Posting Blocked: Insufficient stock for "${firstErr.name}" (Available: ${firstErr.available} ${firstErr.uom}, Required: ${firstErr.required} ${firstErr.uom})`);
      return;
    }

    setLoading(true);
    try {
      // Resolve assembly number: send 'AUTO' if new and unset, 'AUTO', or matches the predicted placeholder
      const cleanAssemblyNo = (!assemblyId && (
        !data.assembly_no || 
        data.assembly_no.trim() === '' || 
        data.assembly_no.toUpperCase() === 'AUTO' || 
        data.assembly_no === predictedNumber
      )) ? 'AUTO' : data.assembly_no.trim();

      // Step 1: Always save header and items with status = 'Draft' first
      const { data: resultId, error: rpcError } = await supabase.rpc('create_or_update_stock_assembly', {
        p_assembly_id: assemblyId || null,
        p_company_id: companyId,
        p_assembly_no: cleanAssemblyNo,
        p_godown_id: data.godown_id,
        p_assembly_date: data.assembly_date,
        p_overhead_cost: Number(data.overhead_cost || 0),
        p_status: 'Draft',
        p_notes: data.notes || '',
        p_items: validLines.map(l => ({
           item_id: l.item_id,
           line_type: l.line_type,
           quantity: Number(l.quantity),
           unit_cost: Number(l.unit_cost || 0)
        }))
      });

      if (rpcError) throw rpcError;

      // Step 2: Atomic Completion & GL Posting via rpc_complete_stock_assembly
      if (isComplete) {
         const { data: completionResult, error: completeError } = await supabase.rpc('complete_stock_assembly', {
             p_assembly_id: resultId,
             p_company_id: companyId
         });
         
         if (completeError) {
           if (completeError.message && completeError.message.includes('ERR_INSUFFICIENT_STOCK')) {
             throw new Error('Transaction Blocked: Real-time stock depletion detected. Another transaction may have consumed this inventory.');
           }
           throw completeError;
         }

         // Step 3: Reactive Cross-Tab & Memory Cache Invalidation
         queryClientInstance.invalidateQueries({ queryKey: ['CurrentStock'] });
         queryClientInstance.invalidateQueries({ queryKey: ['Item'] });
         queryClientInstance.invalidateQueries({ queryKey: ['StockAssembly'] });

         try {
           const syncChannel = new BroadcastChannel('sajilo_sync');
           syncChannel.postMessage({ type: 'INVALIDATE', tableName: 'CurrentStock' });
           syncChannel.postMessage({ type: 'INVALIDATE', tableName: 'Item' });
           syncChannel.postMessage({ type: 'INVALIDATE', tableName: 'StockAssembly' });
           syncChannel.close();
         } catch (bcErr) {}

         window.dispatchEvent(new CustomEvent('sajilo_invalidate', { detail: 'CurrentStock' }));
         window.dispatchEvent(new CustomEvent('sajilo_invalidate', { detail: 'Item' }));

         toast.success('Stock Assembly completed, physical inventory updated, and General Ledger balanced!');
      } else {
         queryClientInstance.invalidateQueries({ queryKey: ['StockAssembly'] });
         toast.success('Stock Assembly Draft saved successfully!');
      }

      onSaved();
    } catch (e) {
      toast.error(e.message || 'Failed to save stock assembly');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelAssembly = async () => {
    if (!cancelReasonInput.trim()) {
      toast.error('Please enter a cancellation reason');
      return;
    }

    setCancelling(true);
    try {
      const { data: cancelResult, error: cancelError } = await supabase.rpc('cancel_stock_assembly', {
        p_assembly_id: assemblyId,
        p_company_id: companyId,
        p_reason: cancelReasonInput.trim()
      });

      if (cancelError) throw cancelError;

      queryClientInstance.invalidateQueries({ queryKey: ['CurrentStock'] });
      queryClientInstance.invalidateQueries({ queryKey: ['Item'] });
      queryClientInstance.invalidateQueries({ queryKey: ['StockAssembly'] });

      try {
        const syncChannel = new BroadcastChannel('sajilo_sync');
        syncChannel.postMessage({ type: 'INVALIDATE', tableName: 'CurrentStock' });
        syncChannel.postMessage({ type: 'INVALIDATE', tableName: 'Item' });
        syncChannel.postMessage({ type: 'INVALIDATE', tableName: 'StockAssembly' });
        syncChannel.close();
      } catch (bcErr) {}

      window.dispatchEvent(new CustomEvent('sajilo_invalidate', { detail: 'CurrentStock' }));
      window.dispatchEvent(new CustomEvent('sajilo_invalidate', { detail: 'Item' }));

      toast.success(cancelResult?.message || 'Stock Assembly successfully cancelled and reversed!');
      setShowCancelModal(false);
      onSaved();
    } catch (e) {
      toast.error(e.message || 'Failed to cancel stock assembly');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <>
      <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between pr-6">
              <div className="flex items-center gap-3">
                <DialogTitle className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-indigo-500" />
                  {assemblyId ? (isLocked ? 'View Stock Assembly' : 'Edit Stock Assembly') : 'New Stock Assembly'}
                </DialogTitle>
                <span className={`text-xs px-2.5 py-0.5 rounded-full border font-medium ${
                  assemblyStatus === 'Completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400'
                  : assemblyStatus === 'Cancelled' ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400'
                  : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400'
                }`}>
                  {assemblyStatus}
                </span>
              </div>
              {!assemblyId && !isLocked && (
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm" 
                  onClick={openTemplateModal}
                  className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/30 hover:bg-indigo-50 dark:bg-indigo-500/10"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy from Previous Assembly
                </Button>
              )}
            </div>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* Status Alert Banners */}
            {assemblyStatus === 'Completed' && (
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-xs text-emerald-800 dark:text-emerald-300">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span><strong>Completed & Locked:</strong> Physical inventory has been deducted/added and balanced journal entries have been posted to the General Ledger.</span>
                </div>
                <Button 
                  type="button" 
                  variant="destructive" 
                  size="sm" 
                  onClick={() => setShowCancelModal(true)}
                  className="h-7 text-xs shrink-0 ml-3"
                >
                  Reverse / Cancel Assembly
                </Button>
              </div>
            )}

            {assemblyStatus === 'Cancelled' && (
              <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-xs text-red-800 dark:text-red-300">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>Assembly Cancelled & Reversed</span>
                </div>
                {cancellationReason && (
                  <p className="mt-1 text-red-700/80 dark:text-red-400 text-[11px]">Reason: {cancellationReason}</p>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label className="flex items-center justify-between text-xs">
                  <span>Assembly No *</span>
                  {!assemblyId && (
                    <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">
                      Auto-Numbered
                    </span>
                  )}
                </Label>
                <Input 
                  {...register('assembly_no')} 
                  placeholder={predictedNumber ? `Auto (${predictedNumber})` : 'AUTO'}
                  disabled={isLocked}
                  className="font-mono text-xs"
                />
              </div>
              <div>
                <Label>Date *</Label>
                <DateInput value={watch('assembly_date')} onChange={val => setValue('assembly_date', val)} disabled={isLocked} />
              </div>
              <div>
                <Label>Godown / Branch *</Label>
                <Select onValueChange={v => setValue('godown_id', v)} value={watchGodownId} disabled={isLocked}>
                  <SelectTrigger disabled={isLocked}>
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

            {/* Line Items Table */}
            <div className="border border-border rounded-xl p-4 bg-card shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-sm text-foreground">Assembly Bill of Materials (BOM)</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Specify consumed raw materials, scrap recovery, and target finished goods</p>
                </div>
                {!isLocked && (
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm" 
                    onClick={() => append({ item_id: '', line_type: 'Consumed', quantity: 1, unit_cost: 0 })}
                  >
                    <Plus className="w-4 h-4 mr-1.5" /> Add Item
                  </Button>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-[11px] font-semibold text-muted-foreground bg-muted/30 uppercase tracking-wider text-left">
                      <th className="py-2.5 px-2">Type</th>
                      <th className="py-2.5 px-2">Item</th>
                      <th className="py-2.5 px-2 text-right">Available Stock</th>
                      <th className="py-2.5 px-2">UOM</th>
                      <th className="py-2.5 px-2 text-right w-24">Qty</th>
                      <th className="py-2.5 px-2 text-right w-28">Unit Cost</th>
                      <th className="py-2.5 px-2 text-right w-28">Total Cost</th>
                      <th className="py-2.5 px-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {fields.map((field, index) => {
                      const currentLine = watchLines[index] || {};
                      const selectedItem = itemsMap.get(currentLine.item_id);
                      const uom = selectedItem?.unit_of_measure || '—';
                      const stockInfo = getLineStockInfo(currentLine);
                      const isConsumed = currentLine.line_type === 'Consumed';
                      const isProduced = currentLine.line_type === 'Produced';
                      const isWastage = currentLine.line_type === 'Wastage' || currentLine.line_type === 'Wastage (Recovery)';
                      const lineTotal = Number(currentLine.quantity || 0) * Number(currentLine.unit_cost || 0);

                      return (
                        <tr key={field.id} className="hover:bg-muted/10 transition-colors">
                          {/* Type Select */}
                          <td className="py-2.5 px-2 w-36">
                            <Select 
                              disabled={isLocked}
                              onValueChange={v => {
                                setValue(`lineItems.${index}.line_type`, v);
                                if (v === 'Produced') {
                                  setValue(`lineItems.${index}.unit_cost`, 0);
                                } else if (v === 'Consumed' && selectedItem) {
                                  const liveWac = selectedItem.weighted_average_cost || selectedItem.current_unit_cost || selectedItem.purchase_price || 0;
                                  setValue(`lineItems.${index}.unit_cost`, liveWac);
                                }
                              }} 
                              value={currentLine.line_type || 'Consumed'}
                            >
                              <SelectTrigger className="h-8 text-xs" disabled={isLocked}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Consumed">Consumed</SelectItem>
                                <SelectItem value="Produced">Produced</SelectItem>
                                <SelectItem value="Wastage (Recovery)">Wastage (Recovery)</SelectItem>
                              </SelectContent>
                            </Select>
                          </td>

                          {/* Item Select */}
                          <td className="py-2.5 px-2 min-w-[200px]">
                            <Select 
                              disabled={isLocked}
                              onValueChange={v => {
                                 setValue(`lineItems.${index}.item_id`, v);
                                 const item = itemsMap.get(v);
                                 if (item && currentLine.line_type === 'Consumed') {
                                     const liveWac = item.weighted_average_cost || item.current_unit_cost || item.purchase_price || 0;
                                     setValue(`lineItems.${index}.unit_cost`, liveWac);
                                 } else if (currentLine.line_type === 'Produced') {
                                     setValue(`lineItems.${index}.unit_cost`, 0);
                                 }
                              }} 
                              value={currentLine.item_id}
                            >
                              <SelectTrigger className="h-8 text-xs" disabled={isLocked}>
                                <SelectValue placeholder="Select Item" />
                              </SelectTrigger>
                              <SelectContent>
                                {items.map(i => {
                                  const avail = stockMap[i.id] ?? 0;
                                  return (
                                    <SelectItem key={i.id} value={i.id}>
                                      {i.item_name} {i.unit_of_measure ? `(${i.unit_of_measure})` : ''} {watchGodownId ? `• Stk: ${avail}` : ''}
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                            {!isLocked && stockInfo.isBlocked && (
                              <p className="text-[10px] text-red-500 font-semibold mt-0.5 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 shrink-0" />
                                {stockInfo.errorMsg}
                              </p>
                            )}
                          </td>

                          {/* Available Stock Column */}
                          <td className="py-2.5 px-2 text-right whitespace-nowrap font-mono">
                            {isConsumed ? (
                              stockInfo.available <= 0 ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400">
                                  0.00 {uom}
                                </span>
                              ) : (
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                  stockInfo.isBlocked 
                                    ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400'
                                    : 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                }`}>
                                  {stockInfo.available.toFixed(2)} {uom}
                                </span>
                              )
                            ) : (
                              <span className="text-muted-foreground text-[11px]">
                                {stockMap[currentLine.item_id] !== undefined ? `${stockMap[currentLine.item_id].toFixed(2)} ${uom}` : '—'}
                              </span>
                            )}
                          </td>

                          {/* UOM Column */}
                          <td className="py-2.5 px-2 whitespace-nowrap">
                            <span className="font-semibold text-xs text-foreground bg-muted/40 px-2 py-0.5 rounded border border-border">
                              {uom}
                            </span>
                          </td>

                          {/* Qty Input */}
                          <td className="py-2.5 px-2 text-right">
                            <Input 
                              type="number" 
                              step="0.01" 
                              min="0.001"
                              disabled={isLocked}
                              className={`h-8 text-right font-mono text-xs ${!isLocked && stockInfo.isBlocked ? 'border-red-500 focus-visible:ring-red-400' : ''}`}
                              {...register(`lineItems.${index}.quantity`)} 
                            />
                          </td>

                          {/* Unit Cost Input */}
                          <td className="py-2.5 px-2 text-right">
                            <Input 
                              type="number" 
                              step="0.01" 
                              className="h-8 text-right font-mono text-xs"
                              disabled={isLocked || isProduced}
                              title={isProduced ? 'Produced cost is computed automatically' : isWastage ? 'Enter scrap Net Realizable Value' : 'Live WAC cost'}
                              {...register(`lineItems.${index}.unit_cost`)} 
                            />
                            {isWastage && (
                              <span className="text-[9px] text-muted-foreground block text-right">Scrap NRV</span>
                            )}
                          </td>

                          {/* Total Cost Column */}
                          <td className="py-2.5 px-2 text-right font-mono font-semibold text-xs whitespace-nowrap">
                            {isProduced ? (
                              <span className="text-indigo-600 dark:text-indigo-400">
                                {formatNumber(totalProductionCost)}
                              </span>
                            ) : isWastage ? (
                              <span className="text-emerald-600 dark:text-emerald-400">
                                ({formatNumber(lineTotal)})
                              </span>
                            ) : (
                              <span>{formatNumber(lineTotal)}</span>
                            )}
                          </td>

                          {/* Action Button */}
                          <td className="py-2.5 px-2 text-center">
                            {!isLocked && (
                              <Button 
                                type="button" 
                                variant="ghost" 
                                size="icon" 
                                className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-500/10" 
                                onClick={() => remove(index)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {!isLocked && hasStockDeficit && (
                <div className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-xs text-red-700 dark:text-red-400 space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                    <span>Insufficient Stock Block: Assembly cannot be completed</span>
                  </div>
                  <ul className="list-disc pl-5 space-y-0.5 text-[11px]">
                    {stockErrors.map((err, i) => (
                      <li key={i}>
                        <strong>{err.name}</strong>: Available {err.available} {err.uom}, entered {err.required} {err.uom} ({err.msg})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Cost Summary Box */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 dark:bg-slate-900/40 p-4 rounded-xl border border-border">
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Assembly Overhead (Direct Labor / Machinery / Power)</Label>
                  <Input 
                    type="number" 
                    step="0.01" 
                    disabled={isLocked}
                    className="h-8 text-xs mt-1"
                    placeholder="0.00"
                    {...register('overhead_cost')} 
                  />
                  <span className="text-[10px] text-muted-foreground">Absorbed via Manufacturing Overhead (Account 5300)</span>
                </div>
                <div>
                  <Label className="text-xs">Notes / Batch Remarks</Label>
                  <Input 
                    disabled={isLocked}
                    className="h-8 text-xs mt-1"
                    placeholder="Optional assembly notes..."
                    {...register('notes')} 
                  />
                </div>
              </div>

              <div className="flex flex-col justify-center space-y-2 border-t md:border-t-0 md:border-l border-border md:pl-6 pt-3 md:pt-0 text-xs">
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>Raw Materials Consumed:</span>
                  <span className="font-mono font-medium text-foreground">NPR {formatNumber(totalConsumed)}</span>
                </div>
                {totalScrapRecovery > 0 && (
                  <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400">
                    <span>Scrap Recovery Value (Deducted):</span>
                    <span className="font-mono font-semibold">- NPR {formatNumber(totalScrapRecovery)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>Batch Overhead Cost:</span>
                  <span className="font-mono font-medium text-foreground">NPR {formatNumber(Number(watchOverhead || 0))}</span>
                </div>
                <div className="h-px bg-border my-1" />
                <div className="flex justify-between items-center font-bold text-sm text-foreground">
                  <span>Total Finished Goods Value:</span>
                  <span className="font-mono text-indigo-600 dark:text-indigo-400">NPR {formatNumber(totalProductionCost)}</span>
                </div>
                <div className="flex justify-between items-center text-xs font-semibold text-muted-foreground">
                  <span>Produced Unit Cost ({producedQty} units):</span>
                  <span className="font-mono text-foreground">NPR {formatNumber(calculatedUnitCost)} / unit</span>
                </div>
              </div>
            </div>

          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border">
            {isLocked ? (
              <div className="flex items-center justify-between w-full">
                {assemblyStatus === 'Completed' ? (
                  <Button 
                    type="button" 
                    variant="destructive" 
                    size="sm" 
                    onClick={() => setShowCancelModal(true)}
                  >
                    Reverse / Cancel Assembly
                  </Button>
                ) : <div />}
                <Button variant="outline" onClick={onClose}>Close</Button>
              </div>
            ) : (
              <>
                <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
                <div className="flex gap-2">
                  <Button 
                    variant="secondary" 
                    onClick={handleSubmit((data) => onSubmit(data, false))} 
                    disabled={loading}
                  >
                    Save as Draft
                  </Button>
                  <Button 
                    onClick={handleSubmit((data) => onSubmit(data, true))} 
                    disabled={loading || hasStockDeficit}
                    className={hasStockDeficit ? 'opacity-50 cursor-not-allowed bg-slate-400' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}
                    title={hasStockDeficit ? 'Fix stock deficits before completing' : 'Complete and post to General Ledger'}
                  >
                    {hasStockDeficit ? 'Stock Deficit (Blocked)' : 'Complete Assembly'}
                  </Button>
                </div>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── MODAL: REVERSE / CANCEL ASSEMBLY CONFIRMATION ── */}
      {showCancelModal && (
        <Dialog open={true} onOpenChange={setShowCancelModal}>
          <DialogContent className="max-w-md" style={{ zIndex: 10000 }}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="w-5 h-5" />
                Reverse & Cancel Stock Assembly
              </DialogTitle>
            </DialogHeader>
            <div className="py-3 space-y-3 text-xs">
              <p className="text-muted-foreground leading-relaxed">
                Are you sure you want to cancel and reverse this Stock Assembly (<strong>{watch('assembly_no')}</strong>)?
              </p>
              <div className="p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-md text-red-700 dark:text-red-400 space-y-1">
                <p className="font-semibold">Automatic System Actions:</p>
                <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                  <li>Deducts the produced Finished Goods from this Godown</li>
                  <li>Restocks all consumed Raw Materials back into inventory</li>
                  <li>Reverses the scrap recovery if recorded</li>
                  <li>Posts automatic balancing contra-entries in General Ledger</li>
                </ul>
              </div>
              <div className="space-y-1.5 pt-1">
                <Label className="text-xs font-semibold">Cancellation Reason *</Label>
                <Input 
                  value={cancelReasonInput} 
                  onChange={e => setCancelReasonInput(e.target.value)} 
                  placeholder="e.g. Wrong raw material quantity entered, defective batch..." 
                  className="h-8 text-xs" 
                />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" size="sm" onClick={() => setShowCancelModal(false)} disabled={cancelling}>
                Keep Assembly
              </Button>
              <Button 
                variant="destructive" 
                size="sm" 
                onClick={handleCancelAssembly} 
                disabled={cancelling || !cancelReasonInput.trim()}
              >
                {cancelling ? 'Reversing...' : 'Confirm Reversal'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ── MODAL: COPY FROM PREVIOUS ASSEMBLY TEMPLATE ── */}
      {showTemplateModal && (
        <Dialog open={true} onOpenChange={setShowTemplateModal}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" style={{ zIndex: 10000 }}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <History className="w-4 h-4 text-indigo-500" />
                Copy from Previous Assembly (Quick-Template)
              </DialogTitle>
            </DialogHeader>
            <div className="py-2 space-y-3">
              <p className="text-xs text-muted-foreground">
                Select a completed assembly to clone its bill of materials recipe. Raw material quantities scale to your target produced quantity with discrete UOM protection.
              </p>

              {loadingTemplates ? (
                <div className="py-12 text-center text-xs text-muted-foreground">Loading recent assemblies...</div>
              ) : recentAssemblies.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground border border-dashed rounded-lg">
                  No completed assemblies found for this company yet.
                </div>
              ) : (
                <div className="divide-y divide-border border border-border rounded-lg overflow-hidden text-xs">
                  {recentAssemblies.map((asm) => {
                    const prod = asm.StockAssemblyItem?.find(l => l.line_type === 'Produced');
                    const itm = itemsMap.get(prod?.item_id);
                    const rawCount = asm.StockAssemblyItem?.filter(l => l.line_type === 'Consumed').length || 0;

                    return (
                      <div 
                        key={asm.id}
                        className="p-3.5 hover:bg-muted/40 transition-colors flex items-center justify-between cursor-pointer"
                        onClick={() => handleCopyFromAssembly(asm)}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-foreground">{asm.assembly_no}</span>
                            <span className="text-[11px] text-muted-foreground">({asm.assembly_date})</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 font-medium">
                              {rawCount} raw materials
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Produced: <strong className="text-foreground">{itm?.item_name || 'Finished Good'}</strong> ({prod?.quantity || 1} {itm?.unit_of_measure || 'PCS'}) • Total: NPR {formatNumber(asm.total_cost || 0)}
                          </p>
                        </div>
                        <Button size="sm" variant="outline" className="text-xs shrink-0">
                          Use Template
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setShowTemplateModal(false)}>Cancel</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
