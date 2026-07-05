import { useState, useEffect } from 'react';
import { sajilo, supabase } from '@/api/sajiloClient';
import { Plus, ArrowRightLeft, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import DateInput from '@/components/shared/DateInput';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useAuth } from '@/lib/AuthContext';
import { cn } from '@/lib/utils';

const emptyForm = {
  transfer_date: format(new Date(), 'yyyy-MM-dd'),
  from_godown_id: '',
  to_godown_id: '',
  notes: '',
  line_items: []
};

export default function StockTransfers() {
  const { activeGodowns, globalSettings, hasAccess } = useAuth();
  const [showNegativeStockWarning, setShowNegativeStockWarning] = useState(false);
  const [negativeStockItems, setNegativeStockItems] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [localGodowns, setLocalGodowns] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  
  // UX Cache: Maps item_id -> current_qty for the selected Source Godown
  const [currentStockMap, setCurrentStockMap] = useState({});

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch physical items and active godowns directly to ensure fresh data
      const [itms, godowns] = await Promise.all([
        sajilo.entities.Item.filter({ is_active: true }, 'item_name', 500),
        sajilo.entities.Godown.filter({ is_active: true, status: 'Active' }, 'name', 500).catch(e => sajilo.entities.Godown.filter({ status: 'Active' }, 'name', 500))
      ]);
      setItems(itms.filter(i => i.item_type !== 'Service'));
      setLocalGodowns(godowns || []);

      // 2. Fetch Historical Transfers from InventoryLedger
      // Group by reference_id (since there is no master StockTransfer table)
      const { data: ledgerData } = await supabase.from('InventoryLedger')
        .select(`
          reference_id, transaction_date, godown_id, quantity_out,
          Item (item_name, item_code)
        `)
        .eq('transaction_type', 'StockTransfer')
        .gt('quantity_out', 0) // only the OUT legs of the transfer
        .order('transaction_date', { ascending: false });

      if (ledgerData) {
        // Group by reference_id
        const grouped = {};
        ledgerData.forEach(row => {
          if (!grouped[row.reference_id]) {
            grouped[row.reference_id] = {
              id: row.reference_id,
              date: row.transaction_date,
              from_godown_id: row.godown_id,
              items_transferred: 0,
              total_qty: 0,
              first_item: row.Item?.item_name
            };
          }
          grouped[row.reference_id].items_transferred += 1;
          grouped[row.reference_id].total_qty += Number(row.quantity_out);
        });
        setTransfers(Object.values(grouped));
      }
    } catch (err) {
      toast.error('Failed to load transfers');
    } finally {
      setLoading(false);
    }
  };

  const getGodownName = (id) => localGodowns?.find(g => g.id === id)?.name || activeGodowns?.find(g => g.id === id)?.name || 'Unknown';

  const fetchCurrentStock = async (godownId) => {
    if (!godownId) {
      setCurrentStockMap({});
      return;
    }
    try {
      const { data } = await supabase.from('CurrentStock').select('item_id, current_qty').eq('godown_id', godownId);
      const stockMap = {};
      (data || []).forEach(r => stockMap[r.item_id] = Number(r.current_qty));
      setCurrentStockMap(stockMap);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSourceChange = (val) => {
    setForm(f => {
      if (val === f.to_godown_id && val !== '') {
        toast.error('Source and Destination cannot be the same!');
        return { ...f, from_godown_id: '' };
      }
      return { ...f, from_godown_id: val };
    });
    fetchCurrentStock(val);
  };

  const handleDestChange = (val) => {
    setForm(f => {
      if (val === f.from_godown_id && val !== '') {
        toast.error('Source and Destination cannot be the same!');
        return { ...f, to_godown_id: '' };
      }
      return { ...f, to_godown_id: val };
    });
  };

  const addItem = (itemId) => {
    if (form.line_items.find(l => l.item_id === itemId)) return toast.info('Item already added');
    
    const it = items.find(i => i.id === itemId);
    if (!it) return;
    
    const newLine = {
      item_id: it.id, 
      item_name: it.item_name, 
      item_code: it.item_code,
      quantity: 1
    };
    setForm(f => ({ ...f, line_items: [...f.line_items, newLine] }));
  };

  const updateLine = (idx, qtyStr) => {
    const lines = [...form.line_items];
    lines[idx].quantity = Number(qtyStr) || 0;
    setForm(f => ({ ...f, line_items: lines }));
  };

  const removeLine = (idx) => setForm(f => ({ ...f, line_items: f.line_items.filter((_, i) => i !== idx) }));

  const handlePost = async (skipStockCheck = false) => {
    if (!form.from_godown_id || !form.to_godown_id) return toast.error('Select both locations');
    if (form.from_godown_id === form.to_godown_id) return toast.error('Locations must be different');
    if (form.line_items.length === 0) return toast.error('Add at least one item');
    
    // UX Safeguard Validation & Negative Stock Policy
    const policy = globalSettings?.negative_stock_policy || 'STRICT_BLOCK';
    const negatives = [];

    for (const item of form.line_items) {
      if (item.quantity <= 0) return toast.error('Quantity must be positive');
      const available = currentStockMap[item.item_id] || 0;
      
      if (item.quantity > available) {
        if (policy === 'STRICT_BLOCK') {
          return toast.error(`Insufficient stock for ${item.item_name}. Max available is ${available}.`);
        } else if (policy === 'WARN_AND_ALLOW' && !skipStockCheck) {
          negatives.push({ name: item.item_name, deficit: item.quantity - available });
        }
      }
    }

    if (negatives.length > 0) {
      setNegativeStockItems(negatives);
      setShowNegativeStockWarning(true);
      return;
    }

    setSaving(true);
    try {
      const transferId = crypto.randomUUID(); // We generate ID since there's no master table
      const idempotencyKey = crypto.randomUUID();
      
      const { data, error } = await supabase.rpc('rpc_post_stock_transfer', {
        p_company_id: sajilo.getCompanyId(),
        p_transfer_id: transferId,
        p_idempotency_key: idempotencyKey,
        p_source_godown_id: form.from_godown_id,
        p_dest_godown_id: form.to_godown_id,
        p_items: form.line_items,
        p_transfer_date: new Date(form.transfer_date).toISOString()
      });

      if (error) throw error;
      if (data?.status === 'duplicate') toast.info('Transfer already posted');
      else toast.success('Stock transfer posted successfully');
      
      setShowForm(false);
      fetchData();
    } catch (err) {
      toast.error(err.message || 'Error occurred while saving');
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { key: 'date', label: 'Date', render: v => v ? format(new Date(v), 'MMM dd, yyyy') : '-' },
    { key: 'from_godown_id', label: 'Source', render: v => getGodownName(v) },
    { key: 'items_transferred', label: 'Summary', render: (v, r) => `${r.first_item} ${v > 1 ? `(+${v - 1} more)` : ''}` },
    { key: 'total_qty', label: 'Total Qty', render: v => <span className="font-semibold">{v}</span> },
    { key: 'status', label: 'Status', render: () => <span className="text-xs font-semibold bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full border border-emerald-200">Posted</span> }
  ];

  return (
    <div>
      <PageHeader 
        title="Stock Transfers" 
        subtitle="Move inventory securely between Godowns" 
        action={() => { setForm(emptyForm); setShowForm(true); setCurrentStockMap({}); }} 
        actionLabel="New Transfer" 
        actionIcon={ArrowRightLeft} 
      />

      <DataTable columns={columns} data={transfers} loading={loading} />

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400">
              <ArrowRightLeft className="w-5 h-5" /> Execute Stock Transfer
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-12 gap-6 mt-4">
            <div className="col-span-12 md:col-span-4 space-y-4 bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
              <div>
                <Label>Date *</Label>
                <DateInput value={form.transfer_date} onChange={v => setForm(f => ({ ...f, transfer_date: v }))} className="mt-1" />
              </div>
              
              <div className="relative">
                <Label>Source Godown *</Label>
                <Select value={form.from_godown_id} onValueChange={handleSourceChange}>
                  <SelectTrigger className={cn("mt-1", !form.from_godown_id && "border-amber-300")}>
                    <SelectValue placeholder="Select Source" />
                  </SelectTrigger>
                  <SelectContent>
                    {(localGodowns.length > 0 ? localGodowns : activeGodowns || []).map(g => (
                      <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-center -my-2 text-slate-400">
                <ArrowRightLeft className="w-6 h-6 rotate-90" />
              </div>

              <div>
                <Label>Destination Godown *</Label>
                <Select value={form.to_godown_id} onValueChange={handleDestChange}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select Destination" />
                  </SelectTrigger>
                  <SelectContent>
                    {(localGodowns.length > 0 ? localGodowns : activeGodowns || []).map(g => (
                      <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>Notes</Label>
                <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="mt-1" placeholder="Reason for transfer" />
              </div>
            </div>

            <div className="col-span-12 md:col-span-8 space-y-4">
              <div className="flex items-center gap-2">
                <Select onValueChange={addItem} value="">
                  <SelectTrigger className="w-[300px] border-dashed border-indigo-500 text-indigo-700 dark:text-indigo-400">
                    <SelectValue placeholder="+ Select Items to Transfer" />
                  </SelectTrigger>
                  <SelectContent>
                    {items.map(it => (
                      <SelectItem key={it.id} value={it.id}>
                        {it.item_name} {form.from_godown_id && currentStockMap[it.id] !== undefined ? `(Avail: ${currentStockMap[it.id]})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {form.line_items.length > 0 ? (
                <div className="border rounded-xl overflow-hidden">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 dark:bg-slate-900 border-b">
                      <tr>
                        <th className="p-3 font-medium">Item Details</th>
                        <th className="p-3 font-medium text-center w-32">Available</th>
                        <th className="p-3 font-medium w-32">Transfer Qty</th>
                        <th className="p-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {form.line_items.map((line, idx) => {
                        const avail = currentStockMap[line.item_id] || 0;
                        const hasError = line.quantity > avail;
                        return (
                          <tr key={idx} className={hasError ? 'bg-red-50 dark:bg-red-950/20' : ''}>
                            <td className="p-3">
                              <div className="font-medium">{line.item_name}</div>
                              <div className="text-xs text-muted-foreground">{line.item_code}</div>
                            </td>
                            <td className="p-3 text-center">
                              <span className={cn("px-2 py-1 rounded text-xs font-semibold", avail > 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700")}>
                                {avail}
                              </span>
                            </td>
                            <td className="p-3">
                              <Input 
                                type="number" 
                                min="1"
                                className={cn("h-8", hasError && "border-red-500")}
                                value={line.quantity || ''} 
                                onChange={e => updateLine(idx, e.target.value)} 
                              />
                            </td>
                            <td className="p-3 text-right">
                              <Button variant="ghost" size="sm" className="h-8 w-8 text-red-500" onClick={() => removeLine(idx)}>×</Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="border-2 border-dashed rounded-xl p-8 text-center text-muted-foreground">
                  No items added. Select items to transfer.
                </div>
              )}
              
              <div className="flex justify-end gap-3 pt-6 border-t mt-6">
                <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm" onClick={handlePost} disabled={saving}>
                  {saving ? 'Posting...' : 'Post Transfer'}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── NEGATIVE STOCK WARNING DIALOG ── */}
      <Dialog open={showNegativeStockWarning} onOpenChange={() => { setShowNegativeStockWarning(false); }}>
        <DialogContent className="max-w-md" style={{ zIndex: 10000 }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" /> Negative Stock Warning
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 text-sm text-muted-foreground space-y-2">
            <p>This transfer will result in negative stock in the source godown for the following items:</p>
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
            <Button variant="outline" onClick={() => setShowNegativeStockWarning(false)}>Cancel</Button>
            {hasAccess('inventory', 'override_negative_stock') && (
              <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={() => { 
                setShowNegativeStockWarning(false); 
                handlePost(true); 
              }}>
                Acknowledge & Proceed
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
