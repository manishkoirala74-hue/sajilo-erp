import { useSearchParams, useNavigate } from 'react-router-dom';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { sajilo } from '@/api/sajiloClient';
import { useMasterData } from '@/hooks/useMasterData';
import { useAuth } from '@/lib/AuthContext';
import { loadActiveTaxTypes } from '@/lib/taxService';
import { 
  Plus, Edit2, Package, AlertTriangle, Upload, X, History, 
  CheckSquare, Square, Minus, Trash2, Ban, TrendingDown, 
  Layers, FileText, Check, ExternalLink, ArrowRight, ShieldCheck, DollarSign 
} from 'lucide-react';
import SearchableSelect from '@/components/shared/SearchableSelect';
import ItemTransactionHistory from '@/components/inventory/ItemTransactionHistory';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import PageHeader from '@/components/shared/PageHeader';
import StatusBadge from '@/components/shared/StatusBadge';
import { toast } from 'sonner';
import FormGrid from '@/components/layout/FormGrid';
import FormRow from '@/components/layout/FormRow';
import { cn } from '@/lib/utils';
import { postItemDeletionWriteOff, loadSettings, postOpeningStock } from '@/lib/glPostingService';

const emptyItem = {
  item_code: '', item_name: '', category_id: '', category_name: '', item_type: 'Product',
  unit_of_measure: 'PCS', purchase_uom: '', sales_uom: '',
  selling_price: 0, purchase_price: 0, weighted_average_cost: 0,
  quantity_on_hand: 0, reorder_level: 0,
  purchase_account_id: '', purchase_account_name: '',
  sales_account_id: '', sales_account_name: '',
  inventory_account_id: '', inventory_account_name: '',
  discount_scheme_id: '', discount_scheme_name: '',
  is_active: true, is_vat_applicable: false,
  tax_type_ids: [], // multi-tax: list of TaxType IDs applied to this item
  description: '', barcode: '', hs_code: '',
  image_url: '', image_urls: [],
  attributes: { model: '', specifications: '', color: '', size: '', weight: '', custom_metadata: [] }
};

// ── Bulk Action Panel ──────────────────────────────────────────────
function BulkActionBar({ selectedIds, onClear, accounts, categories, onBulkUpdate, onBulkDelete, onResetWac }) {
  const [bulkAction, setBulkAction] = useState('');
  const [bulkValue, setBulkValue] = useState('');
  const [applying, setApplying] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const subAccounts = accounts.filter(a => a.ledger_type === 'Sub Ledger' || !a.ledger_type);
  const salesAccounts = subAccounts.filter(a => ['Revenue', 'Other Income'].includes(a.account_type));
  const cogsAccounts = subAccounts.filter(a => ['Cost of Goods Sold', 'COGS', 'Expense', 'Asset'].includes(a.account_type));

  const apply = async () => {
    if (!bulkAction) return;
    if (bulkAction !== 'reset_wac' && !bulkValue) return;
    setApplying(true);

    if (bulkAction === 'reset_wac') {
      if (onResetWac) await onResetWac(selectedIds);
    } else {
      let updateData = {};
      if (bulkAction === 'sales_account') {
        const acc = accounts.find(a => a.id === bulkValue);
        updateData = { sales_account_id: bulkValue, sales_account_name: acc?.account_name || '' };
      } else if (bulkAction === 'purchase_account') {
        const acc = accounts.find(a => a.id === bulkValue);
        updateData = { purchase_account_id: bulkValue, purchase_account_name: acc?.account_name || '' };
      } else if (bulkAction === 'category') {
        const cat = categories.find(c => c.id === bulkValue);
        updateData = { category_id: bulkValue, category_name: cat?.category_name || '' };
      } else if (bulkAction === 'activate') {
        updateData = { is_active: bulkValue === 'true' };
      }

      await onBulkUpdate(selectedIds, updateData);
    }

    setApplying(false);
    setBulkAction('');
    setBulkValue('');
  };

  const handleDelete = async () => {
    setApplying(true);
    await onBulkDelete(selectedIds);
    setApplying(false);
    setConfirmDelete(false);
    setBulkAction('');
  };

  return (
    <div className="flex items-center gap-3 flex-wrap bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 mb-4">
      <div className="flex items-center gap-2">
        <CheckSquare className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold text-primary">{selectedIds.length} item{selectedIds.length > 1 ? 's' : ''} selected</span>
      </div>

      <div className="flex items-center gap-2 flex-1 flex-wrap">
        <Select value={bulkAction} onValueChange={v => { setBulkAction(v); setBulkValue(''); }}>
          <SelectTrigger className="w-52 h-8 text-sm"><SelectValue placeholder="Choose bulk action…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="sales_account">Set Sales Account</SelectItem>
            <SelectItem value="purchase_account">Set Purchase Account</SelectItem>
            <SelectItem value="category">Set Category</SelectItem>
            <SelectItem value="activate">Set Active / Inactive</SelectItem>
            <SelectItem value="reset_wac">Reset WAC to Purchase Price</SelectItem>
            <SelectItem value="delete">Delete Items</SelectItem>
          </SelectContent>
        </Select>

        {bulkAction === 'sales_account' && (
          <Select value={bulkValue} onValueChange={setBulkValue}>
            <SelectTrigger className="w-64 h-8 text-sm"><SelectValue placeholder="Select sales account…" /></SelectTrigger>
            <SelectContent>
              {(salesAccounts.length > 0 ? salesAccounts : subAccounts).map(a => (
                <SelectItem key={a.id} value={a.id}>{a.account_code ? `${a.account_code} — ` : ''}{a.account_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {bulkAction === 'purchase_account' && (
          <Select value={bulkValue} onValueChange={setBulkValue}>
            <SelectTrigger className="w-64 h-8 text-sm"><SelectValue placeholder="Select purchase account…" /></SelectTrigger>
            <SelectContent>
              {(cogsAccounts.length > 0 ? cogsAccounts : subAccounts).map(a => (
                <SelectItem key={a.id} value={a.id}>{a.account_code ? `${a.account_code} — ` : ''}{a.account_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {bulkAction === 'category' && (
          <Select value={bulkValue} onValueChange={setBulkValue}>
            <SelectTrigger className="w-52 h-8 text-sm"><SelectValue placeholder="Select category…" /></SelectTrigger>
            <SelectContent>
              {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.category_name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {bulkAction === 'activate' && (
          <Select value={bulkValue} onValueChange={setBulkValue}>
            <SelectTrigger className="w-40 h-8 text-sm"><SelectValue placeholder="Status…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="true">Active</SelectItem>
              <SelectItem value="false">Inactive</SelectItem>
            </SelectContent>
          </Select>
        )}

        {bulkAction !== 'delete' && (
          <Button size="sm" onClick={apply} disabled={!bulkAction || (bulkAction !== 'reset_wac' && !bulkValue) || applying} className="h-8">
            {applying ? 'Applying…' : 'Apply'}
          </Button>
        )}
        {bulkAction === 'delete' && !confirmDelete && (
          <Button size="sm" variant="destructive" onClick={() => setConfirmDelete(true)} className="h-8">
            <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete {selectedIds.length} Item{selectedIds.length > 1 ? 's' : ''}
          </Button>
        )}
        {bulkAction === 'delete' && confirmDelete && (
          <div className="flex items-center gap-2 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg px-3 py-1.5">
            <span className="text-xs text-red-700 dark:text-red-400 font-medium">Confirm delete {selectedIds.length} item(s)?</span>
            <Button size="sm" variant="destructive" onClick={handleDelete} disabled={applying} className="h-7 text-xs">
              {applying ? 'Deleting…' : 'Yes, Delete'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)} className="h-7 text-xs">Cancel</Button>
          </div>
        )}
      </div>

      <Button size="sm" variant="ghost" onClick={onClear} className="h-8 text-muted-foreground">
        <X className="w-3.5 h-3.5 mr-1" /> Clear
      </Button>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────
export default function Items() {
  

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { globalSettings } = useAuth();
  const companyId = sajilo.getCompanyId();
  const { categories, uoms, accounts, discountSchemes, taxTypes, isLoading: loadingMasterData } = useMasterData();

  // ── TanStack Query for Items (DEVELOPMENT_CHECKLIST.md §2) ────────
  const { data: items = [], isLoading: loadingItems, refetch: fetchItems } = useQuery({
    queryKey: ['Company', companyId, 'Item', 'items'],
    queryFn: async () => {
      const its = await sajilo.entities.Item.list('-created_date', 3000);
      return its || [];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  const invalidateItemCache = useCallback(() => {
    queryClient.invalidateQueries({
      predicate: (query) => query.queryKey.includes('Item')
    });
    try {
      const syncChannel = new BroadcastChannel('sajilo_sync');
      syncChannel.postMessage({ type: 'INVALIDATE', tableName: 'Item' });
    } catch {
      // Fallback
    }
  }, [queryClient]);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyItem);
  const [saving, setSaving] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [uploading, setUploading] = useState(false);
  const [historyItem, setHistoryItem] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [search, setSearch] = useState('');
  const [initOpeningStock, setInitOpeningStock] = useState(false);
  const [priceRevisionPrompt, setPriceRevisionPrompt] = useState(null);
  const [priceRevisionReason, setPriceRevisionReason] = useState('');
  const [revisingPrice, setRevisingPrice] = useState(false);
  const [activeTab, setActiveTab] = useState('general');

  const settings = globalSettings || null;
  const imgSettings = useMemo(() => ({
    max_size_mb: settings?.item_image_max_size_mb || 2,
    max_count: settings?.item_image_max_count || 3
  }), [settings]);

  const loading = loadingItems && items.length === 0;

  const defaultVatTax = useMemo(() => {
    return (taxTypes || []).find(t => t.is_default || t.tax_name?.toLowerCase().includes('vat') || Number(t.tax_rate) === 13) || null;
  }, [taxTypes]);

  const currentVatMode = useMemo(() => {
    const ids = form.tax_type_ids || [];
    if (ids.length === 0) return 'exempt';
    if (defaultVatTax && ids.length === 1 && ids[0] === defaultVatTax.id) return 'vat_13';
    return 'custom';
  }, [form.tax_type_ids, defaultVatTax]);

  const setVatMode = (mode) => {
    if (mode === 'vat_13') {
      if (defaultVatTax) {
        sf('tax_type_ids', [defaultVatTax.id]);
        sf('is_vat_applicable', true);
      } else {
        toast.warning('Default 13% VAT tax type not found in Settings.');
      }
    } else if (mode === 'exempt') {
      sf('tax_type_ids', []);
      sf('is_vat_applicable', false);
    }
  };

  const handleItemTypeSelect = (type) => {
    setForm(prev => {
      const next = { ...prev, item_type: type };
      if (type === 'Service') {
        next.unit_of_measure = prev.unit_of_measure && ['HRS', 'JOB', 'SRV'].includes(prev.unit_of_measure)
          ? prev.unit_of_measure 
          : ((uoms || []).find(u => ['HRS', 'JOB', 'SRV'].includes(u.uom_code))?.uom_code || 'JOB');
        next.purchase_price = 0;
        next.quantity_on_hand = 0;
        next.reorder_level = 0;
        next.inventory_account_id = '';
        next.inventory_account_name = '';
        if (activeTab === 'stock') setActiveTab('general');
      } else {
        if (!prev.unit_of_measure || ['HRS', 'JOB', 'SRV'].includes(prev.unit_of_measure)) {
          next.unit_of_measure = 'PCS';
        }
      }
      return next;
    });
  };

  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      openNew();
      searchParams.delete('new');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const openNew = () => { 
    // P3: Read defaults from GL Settings, with graceful fallback to hardcoded codes if not configured
    const defSales = accounts.find(a => a.id === settings?.gl_default_sales_account_id) || accounts.find(a => a.account_code === '4100');
    const defCogs = accounts.find(a => a.id === settings?.gl_default_cogs_account_id) || accounts.find(a => a.account_code === '5100');
    const defInv = accounts.find(a => a.id === settings?.gl_default_inventory_account_id) || accounts.find(a => a.account_code === '1140');

    setForm({ 
      ...emptyItem, 
      image_urls: [],
      sales_account_id: defSales?.id || '',
      sales_account_name: defSales?.account_name || '',
      purchase_account_id: defCogs?.id || '',
      purchase_account_name: defCogs?.account_name || '',
      inventory_account_id: defInv?.id || '',
      inventory_account_name: defInv?.account_name || '',
    }); 
    setEditing(null); 
    setInitOpeningStock(false);
    setPriceRevisionPrompt(null);
    setPriceRevisionReason('');
    setActiveTab('general');
    setShowForm(true); 
  };

  const openEdit = (item) => {
    const rawTaxIds = Array.isArray(item.tax_type_ids) 
      ? item.tax_type_ids 
      : (item.tax_type_ids ? JSON.parse(item.tax_type_ids) : []);

    setForm({
      ...item,
      attributes: item.attributes || { model: '', specifications: '', color: '', size: '', weight: '', custom_metadata: [] },
      image_urls: item.image_urls || (item.image_url ? [item.image_url] : []),
      tax_type_ids: rawTaxIds,
    });
    setEditing(item);
    setInitOpeningStock(false);
    setPriceRevisionPrompt(null);
    setPriceRevisionReason('');
    setActiveTab('general');
    setShowForm(true); 
  };

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    const currentCount = (form.image_urls || []).length;
    const remaining = imgSettings.max_count - currentCount;
    if (remaining <= 0) { toast.error(`Max ${imgSettings.max_count} images allowed`); return; }
    const toUpload = files.slice(0, remaining);
    
    setUploading(true);
    try {
      for (const file of toUpload) {
        if (file.size > imgSettings.max_size_mb * 1024 * 1024) {
          toast.error(`"${file.name}" exceeds ${imgSettings.max_size_mb}MB limit`); continue;
        }
        try {
          const { file_url } = await sajilo.integrations.Core.UploadFile({ file, folder: 'items' });
          setForm(prev => ({ ...prev, image_urls: [...(prev.image_urls || []), file_url], image_url: file_url }));
        } catch (err) {
          toast.error(`Failed to upload "${file.name}": ${err.message || 'Unknown error'}`);
        }
      }
    } finally {
      setUploading(false);
      e.target.value = null;
    }
    if (files.length > remaining) toast.warning(`Only ${remaining} more image(s) allowed — rest skipped`);
  };

  const removeImage = (idx) => setForm(prev => {
    const arr = (prev.image_urls || []).filter((_, i) => i !== idx);
    return { ...prev, image_urls: arr, image_url: arr[0] || '' };
  });

  const sf = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    if (!form.item_name) { toast.error('Item name is required'); return; }

    const isPhysical = form.item_type !== 'Service';
    const hasOpeningStock = !editing && initOpeningStock && Number(form.quantity_on_hand || 0) > 0;
    const purchasePrice = Number(form.purchase_price || 0);

    // Only validate opening stock purchase cost during initial item creation
    if (!editing && isPhysical && hasOpeningStock && purchasePrice <= 0) {
      toast.error('Purchase cost/WAC must be strictly greater than zero when initializing opening stock.', { duration: 6000 });
      return;
    }

    const { image_urls: _image_urls, total_asset_value: _total_asset_value, ...payload } = form;
    payload.image_url = form.image_url || (form.image_urls && form.image_urls[0]) || null;
    const taxIds = Array.isArray(form.tax_type_ids) ? form.tax_type_ids : [];
    payload.tax_type_ids = taxIds;
    payload.is_vat_applicable = taxIds.length > 0;

    // Check if selling price changed on edit — trigger in-modal revision audit
    if (editing && Number(editing.selling_price || 0) !== Number(payload.selling_price || 0)) {
      setPriceRevisionPrompt({
        oldPrice: Number(editing.selling_price || 0),
        newPrice: Number(payload.selling_price || 0),
        payload
      });
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        delete payload.is_physical; // Generated column
        delete payload.quantity_on_hand; // Maintained strictly via transactions / stock assembly
        delete payload.weighted_average_cost; // Maintained by stock valuation
        delete payload.current_unit_cost; // Maintained by stock valuation
        delete payload.id;
        delete payload.company_id;
        delete payload.created_at;
        delete payload.updated_at;
        await sajilo.entities.Item.update(editing.id, payload);
        toast.success('Item updated');
      } else {
        if (isPhysical) {
          payload.weighted_average_cost = purchasePrice;
          payload.current_unit_cost = purchasePrice;
        }
        if (!initOpeningStock) {
          payload.quantity_on_hand = 0;
        }
        const newItem = await sajilo.entities.Item.create(payload);
        toast.success('Item created');
        
        if (isPhysical && hasOpeningStock && purchasePrice > 0) {
          try {
            const settings = await loadSettings();
            let itemRecord = newItem;
            if (!itemRecord?.id) {
              const { data } = await sajilo.auth.supabase
                .from('Item')
                .select('*')
                .eq('item_name', payload.item_name)
                .eq('company_id', payload.company_id || sajilo.getCompanyId())
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
              itemRecord = data;
            }
            if (itemRecord?.id) {
              await postOpeningStock(itemRecord, settings);
            }
          } catch (e) {
            console.error('Failed to post opening stock GL:', e);
          }
        }
      }
      invalidateItemCache();
      setShowForm(false);
    } catch (err) {
      toast.error(err.message || 'Error occurred while saving');
    } finally {
      setSaving(false);
    }
  };

  const executePriceRevisionSave = async () => {
    if (!priceRevisionReason || !priceRevisionReason.trim()) {
      toast.error("Please provide a mandatory reason for this price revision.");
      return;
    }
    setRevisingPrice(true);
    try {
      await sajilo.auth.supabase.rpc('apply_price_revision_rpc', {
        p_company_id: sajilo.getCompanyId(),
        p_category_id: null,
        p_item_id: editing.id,
        p_adjustment_type: 'MANUAL_INDIVIDUAL',
        p_adjustment_value: Number(priceRevisionPrompt.newPrice || 0),
        p_remarks: priceRevisionReason.trim(),
        p_user_id: (await sajilo.auth.supabase.auth.getUser()).data.user.id
      });

      const payload = { ...priceRevisionPrompt.payload };
      delete payload.selling_price; // Handled by RPC
      delete payload.is_physical;
      delete payload.quantity_on_hand;
      delete payload.weighted_average_cost;
      delete payload.current_unit_cost;
      delete payload.id;
      delete payload.company_id;
      delete payload.created_at;
      delete payload.updated_at;

      await sajilo.entities.Item.update(editing.id, payload);
      toast.success('Item updated with price revision logged');
      invalidateItemCache();
      setShowForm(false);
      setPriceRevisionPrompt(null);
      setPriceRevisionReason('');
    } catch (err) {
      toast.error(err.message || 'Failed to apply price revision');
    } finally {
      setRevisingPrice(false);
    }
  };

  const handleBulkUpdate = async (ids, data) => {
    const payload = { ...data };
    delete payload.is_physical;
    await Promise.all(ids.map(id => sajilo.entities.Item.update(id, payload)));
    toast.success(`Updated ${ids.length} item(s)`);
    setSelectedIds([]);
    invalidateItemCache();
  };

  const handleResetWac = async (ids) => {
    const itemsToUpdate = items.filter(i => ids.includes(i.id));
    await Promise.all(itemsToUpdate.map(item => sajilo.entities.Item.update(item.id, {
      weighted_average_cost: item.purchase_price || 0,
      current_unit_cost: item.purchase_price || 0,
    })));
    toast.success(`Reset WAC to Purchase Price for ${ids.length} item(s)`);
    setSelectedIds([]);
    invalidateItemCache();
  };

  const handleBulkDelete = async (ids) => {
    const user = await sajilo.auth.me();
    const deletedBy = user?.email || 'Unknown';

    // Check for transactions in each module
    const [posSales, poOrders, poInvoices, soOrders, soInvoices] = await Promise.all([
      sajilo.entities.POSSale.list('-created_date', 2000),
      sajilo.entities.PurchaseOrder.list('-created_date', 2000),
      sajilo.entities.PurchaseInvoice.list('-created_date', 2000),
      sajilo.entities.SalesOrder.list('-created_date', 2000),
      sajilo.entities.SalesInvoice.list('-created_date', 2000),
    ]);

    const hasItemInDocs = (itemId, docs) =>
      docs.some(d => (d.line_items || []).some(li => li.item_id === itemId));

    const itemsToDelete = [];
    const blockedItems = [];

    // Fetch all GL lines once for balance/transaction check
    const allGLLines = await sajilo.entities.GeneralLedgerLine.list('-created_date', 5000);
    const glAccountIds = new Set(allGLLines.map(l => l.account_id).filter(Boolean));

    const allItems = items.filter(i => ids.includes(i.id));
    for (const item of allItems) {
      const id = item.id;

      // Block if any linked GL account has a non-zero balance or posted transactions
      const linkedAccountIds = [item.inventory_account_id, item.purchase_account_id, item.sales_account_id].filter(Boolean);
      const hasGLActivity = linkedAccountIds.some(accId => glAccountIds.has(accId));

      if (hasItemInDocs(id, posSales)) {
        blockedItems.push({ name: item.item_name, reason: 'This item has transactions in POS Sales' });
      } else if (hasItemInDocs(id, poOrders)) {
        blockedItems.push({ name: item.item_name, reason: 'This item has transactions in Purchase Orders' });
      } else if (hasItemInDocs(id, poInvoices)) {
        blockedItems.push({ name: item.item_name, reason: 'This item has transactions in Purchase Invoices' });
      } else if (hasItemInDocs(id, soOrders)) {
        blockedItems.push({ name: item.item_name, reason: 'This item has transactions in Sales Orders' });
      } else if (hasItemInDocs(id, soInvoices)) {
        blockedItems.push({ name: item.item_name, reason: 'This item has transactions in Sales Invoices' });
      } else if (hasGLActivity) {
        blockedItems.push({ name: item.item_name, reason: 'This item has posted debit/credit journal entries in the General Ledger. Mark it Inactive instead.' });
      } else if ((item.current_balance || item.total_asset_value || 0) !== 0 || (item.quantity_on_hand || 0) !== 0) {
        blockedItems.push({ name: item.item_name, reason: `This item has a non-zero inventory balance or quantity. Post a stock write-off first.` });
      } else {
        itemsToDelete.push(item);
      }
    }

    if (blockedItems.length > 0) {
      blockedItems.forEach(b => toast.error(`"${b.name}": ${b.reason}`, { duration: 6000 }));
    }

    if (itemsToDelete.length > 0) {
      // 1. Post GL write-off for items with remaining stock value (before deleting)
      const settings = await loadSettings();
      await postItemDeletionWriteOff(itemsToDelete, settings);

      // 2. Log deletions
      await Promise.all(itemsToDelete.map(item =>
        sajilo.entities.ItemDeleteLog.create({
          item_id: item.id,
          item_code: item.item_code || '',
          item_name: item.item_name,
          item_type: item.item_type || '',
          category_name: item.category_name || '',
          selling_price: item.selling_price || 0,
          quantity_on_hand: item.quantity_on_hand || 0,
          hs_code: item.hs_code || '',
          deleted_by: deletedBy,
          notes: `Bulk deleted from Items page`,
        })
      ));

      // 3. Delete items
      await Promise.all(itemsToDelete.map(item => sajilo.entities.Item.delete(item.id)));
      toast.success(`Deleted ${itemsToDelete.length} item(s) successfully`);
    }

    setSelectedIds([]);
    invalidateItemCache();
  };

  // ── Filtering ──────────────────────────────────────────────────
  const filtered = useMemo(() => items.filter(i => {
    const matchType = (() => {
      if (filterType === 'low_stock') return i.item_type !== 'Service' && i.quantity_on_hand <= i.reorder_level && i.reorder_level > 0;
      if (filterType === 'inactive') return !i.is_active;
      if (filterType === 'services') return i.item_type === 'Service';
      if (filterType === 'physical') return i.item_type !== 'Service';
      return true;
    })();
    const matchCat = filterCategory === 'all' || i.category_id === filterCategory;
    const matchSearch = !search || i.item_name?.toLowerCase().includes(search.toLowerCase()) || i.item_code?.toLowerCase().includes(search.toLowerCase());
    return matchType && matchCat && matchSearch;
  }), [items, filterType, filterCategory, search]);

  // ── Selection helpers ──────────────────────────────────────────
  const allFilteredIds = filtered.map(i => i.id);
  const allSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selectedIds.includes(id));
  const someSelected = allFilteredIds.some(id => selectedIds.includes(id)) && !allSelected;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(prev => prev.filter(id => !allFilteredIds.includes(id)));
    } else {
      setSelectedIds(prev => [...new Set([...prev, ...allFilteredIds])]);
    }
  };

  const toggleSelectItem = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const selectByCategory = (catId) => {
    const catIds = items.filter(i => i.category_id === catId).map(i => i.id);
    const allCatSelected = catIds.every(id => selectedIds.includes(id));
    if (allCatSelected) {
      setSelectedIds(prev => prev.filter(id => !catIds.includes(id)));
    } else {
      setSelectedIds(prev => [...new Set([...prev, ...catIds])]);
    }
  };

  const subAccounts = accounts.filter(a => a.ledger_type === 'Sub Ledger' || !a.ledger_type);
  const cogsAccounts = subAccounts.filter(a => ['Cost of Goods Sold', 'COGS', 'Expense', 'Asset'].includes(a.account_type));
  const salesAccounts = subAccounts.filter(a => ['Revenue', 'Other Income'].includes(a.account_type));
  const assetAccounts = subAccounts.filter(a => a.account_type === 'Asset');
  const uomOptions = uoms.length > 0 ? uoms : [{ uom_code: 'PCS', uom_name: 'Pieces' }, { uom_code: 'KG', uom_name: 'Kilogram' }];

  return (
    <div>
      <PageHeader
        title="Inventory Items"
        subtitle="Manage your product catalog, account mapping and stock levels"
        action={openNew}
        actionLabel="New Item"
        actionIcon={Plus}
      />

      {/* Type Filter Tabs */}
      <div className="flex gap-2 mb-3 flex-wrap">
        {[
          { key: 'all', label: 'All Items' },
          { key: 'physical', label: 'Physical' },
          { key: 'services', label: 'Services' },
          { key: 'low_stock', label: `Low Stock (${items.filter(i => i.item_type !== 'Service' && i.quantity_on_hand <= i.reorder_level && i.reorder_level > 0).length})` },
          { key: 'inactive', label: 'Inactive' },
        ].map(f => (
          <button key={f.key} onClick={() => { setFilterType(f.key); setSelectedIds([]); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filterType === f.key ? 'bg-primary text-white' : 'bg-card border border-border text-muted-foreground hover:bg-muted'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Category Filter + Search Row */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <div className="relative flex-1 min-w-48">
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search items…"
            className="w-full h-9 pl-3 pr-3 border border-input rounded-md text-sm bg-transparent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        <Select value={filterCategory} onValueChange={v => { setFilterCategory(v); setSelectedIds([]); }}>
          <SelectTrigger className="w-48 h-9 text-sm"><SelectValue placeholder="All Categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.category_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Category-wise select buttons */}
        {categories.slice(0, 5).map(c => {
          const catIds = items.filter(i => i.category_id === c.id).map(i => i.id);
          const allCatSel = catIds.length > 0 && catIds.every(id => selectedIds.includes(id));
          return (
            <button key={c.id} onClick={() => selectByCategory(c.id)}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors', allCatSel ? 'bg-primary/10 border-primary text-primary' : 'bg-card border-border text-muted-foreground hover:bg-muted')}>
              {allCatSel ? '✓ ' : ''}{c.category_name} ({catIds.length})
            </button>
          );
        })}
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.length > 0 && (
        <BulkActionBar
          selectedIds={selectedIds}
          onClear={() => setSelectedIds([])}
          accounts={accounts}
          categories={categories}
          onBulkUpdate={handleBulkUpdate}
          onBulkDelete={handleBulkDelete}
          onResetWac={handleResetWac}
        />
      )}

      {/* Items Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20">
          <div className="flex items-center gap-3">
            <button onClick={toggleSelectAll} className="flex items-center justify-center w-5 h-5">
              {allSelected
                ? <CheckSquare className="w-4 h-4 text-primary" />
                : someSelected
                  ? <div className="w-4 h-4 border-2 border-primary rounded flex items-center justify-center bg-primary/10"><Minus className="w-2.5 h-2.5 text-primary" /></div>
                  : <Square className="w-4 h-4 text-muted-foreground" />
              }
            </button>
            <span className="text-sm font-semibold">
              {filtered.length} items
              {selectedIds.length > 0 && <span className="ml-2 text-primary">({selectedIds.length} selected)</span>}
            </span>
          </div>
          {selectedIds.length > 0 && (
            <button onClick={() => setSelectedIds([])} className="text-xs text-muted-foreground hover:text-foreground">
              Deselect all
            </button>
          )}
        </div>

        <div className="table-scroll-container">
          {loading ? (
            <div className="p-8 space-y-3">
              {Array(6).fill(0).map((_, i) => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">No items found</div>
          ) : (
            <table className="table-fluid-grid text-sm">
              <thead className="cell-density bg-muted/30 border-b border-border">
                <tr>
                  <th className="cell-density w-10" />
                  <th className="cell-density text-left  text-xs font-semibold text-muted-foreground">Item</th>
                  <th className="cell-density text-left  text-xs font-semibold text-muted-foreground">Category</th>
                  <th className="cell-density text-left  text-xs font-semibold text-muted-foreground">Type</th>
                  <th className="cell-density text-left  text-xs font-semibold text-muted-foreground">UOM</th>
                  <th className="cell-density text-right  text-xs font-semibold text-muted-foreground">Stock</th>
                  <th className="cell-density text-right  text-xs font-semibold text-muted-foreground">Sell Price</th>
                  <th className="cell-density text-left  text-xs font-semibold text-muted-foreground">Sales A/c</th>
                  <th className="cell-density text-left  text-xs font-semibold text-muted-foreground">Purchase A/c</th>
                  <th className="cell-density text-left  text-xs font-semibold text-muted-foreground">HS Code</th>
                  <th className="cell-density text-center  text-xs font-semibold text-muted-foreground">Status</th>
                  <th className="cell-density w-20" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(item => {
                  const isSelected = selectedIds.includes(item.id);
                  return (
                    <tr key={item.id}
                      className={cn('transition-colors hover:bg-muted/20', isSelected && 'bg-primary/5')}
                    >
                      {/* Checkbox */}
                      <td className="cell-density ">
                        <button onClick={() => toggleSelectItem(item.id)} className="flex items-center justify-center">
                          {isSelected
                            ? <CheckSquare className="w-4 h-4 text-primary" />
                            : <Square className="w-4 h-4 text-muted-foreground" />
                          }
                        </button>
                      </td>
                      {/* Item */}
                      <td className="cell-density ">
                        <div className="flex items-center gap-3">
                          {(item.image_url || (item.image_urls && item.image_urls[0])) ? (
                            <img src={item.image_url || item.image_urls[0]} alt={item.item_name} className="w-8 h-8 rounded-lg object-cover border border-border shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center shrink-0">
                              <Package className="w-3.5 h-3.5 text-indigo-500" />
                            </div>
                          )}
                          <div>
                            <p className="font-medium">{item.item_name}</p>
                            <p className="text-xs text-muted-foreground">{item.item_code || '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="cell-density text-sm text-muted-foreground">{item.category_name || '—'}</td>
                      <td className="cell-density text-sm">{item.item_type}</td>
                      <td className="cell-density text-sm text-muted-foreground">{item.unit_of_measure}</td>
                      <td className="cell-density text-right">
                        {item.item_type === 'Service'
                          ? <span className="text-xs text-blue-500 italic">N/A</span>
                          : <div className="flex items-center justify-end gap-1">
                              <span className={cn('font-semibold', 
                                item.quantity_on_hand < 0 ? 'text-red-600 dark:text-red-500 bg-red-100 dark:bg-red-900/30 px-1.5 py-0.5 rounded' 
                                : (item.quantity_on_hand <= item.reorder_level && item.reorder_level > 0 ? 'text-amber-600 dark:text-amber-400' : '')
                              )}>
                                {item.quantity_on_hand}
                              </span>
                              {item.quantity_on_hand < 0 && <Ban className="w-3 h-3 text-red-500" />}
                              {item.quantity_on_hand >= 0 && item.quantity_on_hand <= item.reorder_level && item.reorder_level > 0 && <AlertTriangle className="w-3 h-3 text-amber-500" />}
                            </div>
                        }
                      </td>
                      <td className="cell-density text-right font-mono text-sm">NPR {Number(item.selling_price).toLocaleString()}</td>
                      <td className="cell-density text-xs">
                        {item.sales_account_name
                          ? <span className="text-muted-foreground">{item.sales_account_name}</span>
                          : <span className="text-red-400">Not mapped</span>
                        }
                      </td>
                      <td className="cell-density text-xs">
                        {item.purchase_account_name
                          ? <span className="text-muted-foreground">{item.purchase_account_name}</span>
                          : <span className="text-red-400">Not mapped</span>
                        }
                      </td>
                      <td className="cell-density text-xs font-mono text-muted-foreground">{item.hs_code || '—'}</td>
                      <td className="cell-density text-center">
                        <StatusBadge status={item.is_active ? 'Active' : 'Inactive'} />
                      </td>
                      <td className="cell-density ">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Transaction History" onClick={() => setHistoryItem(item)}>
                            <History className="w-3.5 h-3.5 text-muted-foreground" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item)}>
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground">
          {filtered.length} of {items.length} items shown
        </div>
      </div>

      {/* Item Form Dialog — V2 Tabbed Progressive Disclosure */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle>{editing ? `Edit Item: ${editing.item_name}` : 'New Item'}</DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {editing ? 'Update item configuration and master details' : 'Set up a new product, finished good, or service'}
                </p>
              </div>
              <div className="flex items-center gap-2 bg-muted/60 px-3 py-1.5 rounded-lg border border-border">
                <Switch id="active-item-switch" checked={form.is_active} onCheckedChange={v => sf('is_active', v)} />
                <Label htmlFor="active-item-switch" className="text-xs font-medium cursor-pointer">
                  {form.is_active ? 'Active' : 'Inactive'}
                </Label>
              </div>
            </div>

            {/* Archetype Quick Selector — Type-Driven Defaults */}
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 bg-muted/60 rounded-lg border border-border">
              {[
                { type: 'Product', label: 'Product (Traded)', hint: 'Buy & Sell' },
                { type: 'Finished Good', label: 'Finished Good', hint: 'Assembled' },
                { type: 'Raw Material', label: 'Raw Material', hint: 'Components' },
                { type: 'Service', label: 'Service', hint: 'Non-physical' },
              ].map(({ type, label, hint }) => {
                const isSel = form.item_type === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => handleItemTypeSelect(type)}
                    className={cn(
                      'py-1.5 px-2 rounded-md text-center transition-all flex flex-col items-center justify-center',
                      isSel 
                        ? 'bg-background text-foreground shadow-sm font-semibold border border-primary/20' 
                        : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                    )}
                  >
                    <span className="text-xs">{label}</span>
                    <span className="text-[10px] text-muted-foreground font-normal">{hint}</span>
                  </button>
                );
              })}
            </div>
          </DialogHeader>

          {/* Radix Tabs for Progressive Disclosure */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-2">
            <TabsList className="grid w-full grid-cols-3 sm:grid-cols-4 h-9 mb-4">
              <TabsTrigger value="general" className="text-xs">General & Pricing</TabsTrigger>
              {form.item_type !== 'Service' && (
                <TabsTrigger value="stock" className="text-xs">Stock & Inventory</TabsTrigger>
              )}
              <TabsTrigger value="accounting" className="text-xs">Accounting & GL</TabsTrigger>
              <TabsTrigger value="specs" className="text-xs">Specs & Media</TabsTrigger>
            </TabsList>

            {/* TAB 1: GENERAL & PRICING */}
            <TabsContent value="general" className="space-y-4">
              <FormGrid>
                <div>
                  <Label>Item Code / SKU</Label>
                  <Input value={form.item_code} onChange={e => sf('item_code', e.target.value)} placeholder="SKU-001" />
                </div>
                <div>
                  <Label>Item Name *</Label>
                  <Input value={form.item_name} onChange={e => sf('item_name', e.target.value)} placeholder="e.g. Mobile Banking Broucher" />
                </div>
                <div>
                  <Label>Category</Label>
                  <Select value={form.category_id} onValueChange={v => {
                    const cat = categories.find(c => c.id === v);
                    setForm(prev => ({
                      ...prev, 
                      category_id: v, 
                      category_name: cat?.category_name || '',
                      purchase_account_id: prev.purchase_account_id || cat?.purchase_account_id || '',
                      purchase_account_name: prev.purchase_account_name || cat?.purchase_account_name || '',
                      sales_account_id: prev.sales_account_id || cat?.sales_account_id || '',
                      sales_account_name: prev.sales_account_name || cat?.sales_account_name || '',
                    }));
                  }}>
                    <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>{categories.map(c => <SelectItem key={c.id} value={c.id}>{c.category_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Base Unit of Measure (UOM)</Label>
                  <Select value={form.unit_of_measure} onValueChange={v => sf('unit_of_measure', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{uomOptions.map(u => <SelectItem key={u.uom_code} value={u.uom_code}>{u.uom_code} — {u.uom_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </FormGrid>

              {/* Pricing Section */}
              <div className="rounded-lg border border-border p-4 bg-muted/20 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pricing & Valuation</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Selling Price (NPR)</Label>
                    <div className="relative mt-1">
                      <Input 
                        type="number" 
                        value={form.selling_price} 
                        onChange={e => sf('selling_price', Number(e.target.value))} 
                      />
                    </div>
                    {editing && (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Editing price triggers an audited price revision history record.
                      </p>
                    )}
                  </div>
                  <div>
                    <Label>
                      {form.item_type === 'Finished Good' 
                        ? 'Standard / Target Production Cost (NPR)' 
                        : form.item_type === 'Service' 
                          ? 'Direct Service Cost (NPR)' 
                          : 'Purchase Price (NPR)'}
                    </Label>
                    <Input 
                      type="number" 
                      value={form.purchase_price} 
                      onChange={e => sf('purchase_price', Number(e.target.value))} 
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {form.item_type === 'Finished Good'
                        ? 'Actual valuation is dynamically calculated from Stock Assembly components (WAC).'
                        : 'Default unit cost on purchase documents & valuation.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Nepal VAT Quick-Selector */}
              <div className="rounded-lg border border-border p-4 bg-muted/20 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tax & VAT (Nepal IRD)</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Select the statutory tax classification for this item</p>
                  </div>
                  {currentVatMode === 'vat_13' && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      13% VAT Active
                    </span>
                  )}
                  {currentVatMode === 'exempt' && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      VAT Exempt (0%)
                    </span>
                  )}
                  {currentVatMode === 'custom' && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                      Custom Multi-Tax
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setVatMode('vat_13')}
                    className={cn(
                      'p-2.5 rounded-lg border text-left transition-colors flex items-center justify-between',
                      currentVatMode === 'vat_13'
                        ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                        : 'border-border bg-card hover:bg-muted/40'
                    )}
                  >
                    <div>
                      <p className="text-xs font-semibold text-foreground">13% VAT (Taxable)</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Standard Nepal VAT rate</p>
                    </div>
                    {currentVatMode === 'vat_13' && <Check className="w-4 h-4 text-primary shrink-0" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => setVatMode('exempt')}
                    className={cn(
                      'p-2.5 rounded-lg border text-left transition-colors flex items-center justify-between',
                      currentVatMode === 'exempt'
                        ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                        : 'border-border bg-card hover:bg-muted/40'
                    )}
                  >
                    <div>
                      <p className="text-xs font-semibold text-foreground">VAT Exempt / Non-VAT</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Zero-rated or exempt goods</p>
                    </div>
                    {currentVatMode === 'exempt' && <Check className="w-4 h-4 text-primary shrink-0" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => setVatMode('custom')}
                    className={cn(
                      'p-2.5 rounded-lg border text-left transition-colors flex items-center justify-between',
                      currentVatMode === 'custom'
                        ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                        : 'border-border bg-card hover:bg-muted/40'
                    )}
                  >
                    <div>
                      <p className="text-xs font-semibold text-foreground">Custom / Multiple Taxes</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Excise, luxury, compound</p>
                    </div>
                    {currentVatMode === 'custom' && <Check className="w-4 h-4 text-primary shrink-0" />}
                  </button>
                </div>

                {/* Custom Multi-Tax Details (only rendered if custom mode) */}
                {currentVatMode === 'custom' && (
                  <div className="pt-2 border-t border-border mt-3 space-y-2">
                    <p className="text-xs font-medium text-foreground">Select Individual Tax Types:</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {taxTypes.map(tt => {
                        const selected = (form.tax_type_ids || []).includes(tt.id);
                        const toggle = () => {
                          const ids = form.tax_type_ids || [];
                          sf('tax_type_ids', selected ? ids.filter(x => x !== tt.id) : [...ids, tt.id]);
                        };
                        return (
                          <label key={tt.id} className={cn(
                            'flex items-start gap-2.5 p-2 rounded-lg border cursor-pointer text-xs',
                            selected ? 'bg-primary/5 border-primary/40' : 'bg-card border-border'
                          )}>
                            <Checkbox checked={selected} onCheckedChange={toggle} className="mt-0.5" />
                            <div>
                              <span className="font-medium">{tt.tax_name} ({tt.tax_rate}%)</span>
                              <p className="text-[10px] text-muted-foreground">{tt.tax_type} · {tt.applies_to}</p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Codes & Description */}
              <FormGrid>
                <div>
                  <Label>Barcode</Label>
                  <Input value={form.barcode || ''} onChange={e => sf('barcode', e.target.value)} placeholder="Barcode / EAN" />
                </div>
                <div>
                  <Label>HS Code</Label>
                  <Input value={form.hs_code || ''} onChange={e => sf('hs_code', e.target.value)} placeholder="e.g. 4901.99" />
                </div>
                <FormRow fullWidth>
                  <Label>Description</Label>
                  <Input value={form.description || ''} onChange={e => sf('description', e.target.value)} placeholder="Optional description or item summary" />
                </FormRow>
              </FormGrid>
            </TabsContent>

            {/* TAB 2: STOCK & INVENTORY (Hidden for Service) */}
            {form.item_type !== 'Service' && (
              <TabsContent value="stock" className="space-y-4">
                {editing ? (
                  /* Edit Mode: Live Stock Audit & Contra-Adjustment Guidance */
                  <div className="rounded-lg border border-border p-4 bg-muted/20 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-primary" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-foreground">Current Inventory Status</span>
                      </div>
                      <span className="text-xs font-medium px-2 py-0.5 rounded bg-muted border border-border">
                        Physical Stock Ledger
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="bg-card p-3 rounded-lg border border-border">
                        <p className="text-xs text-muted-foreground">Quantity on Hand</p>
                        <p className="text-lg font-bold mt-1 text-foreground">
                          {Number(form.quantity_on_hand || 0).toLocaleString()} <span className="text-xs font-normal text-muted-foreground">{form.unit_of_measure}</span>
                        </p>
                      </div>
                      <div className="bg-card p-3 rounded-lg border border-border">
                        <p className="text-xs text-muted-foreground">Weighted Average Cost (WAC)</p>
                        <p className="text-lg font-bold mt-1 text-foreground font-mono">
                          NPR {Number(form.weighted_average_cost || form.purchase_price || 0).toLocaleString()}
                        </p>
                      </div>
                      <div className="bg-card p-3 rounded-lg border border-border">
                        <p className="text-xs text-muted-foreground">Total Stock Valuation</p>
                        <p className="text-lg font-bold mt-1 text-foreground font-mono">
                          NPR {Number(Number(form.quantity_on_hand || 0) * Number(form.weighted_average_cost || form.purchase_price || 0)).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg p-3 text-xs text-blue-900 dark:text-blue-300 space-y-2">
                      <p className="font-semibold flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                        Stock Balance Audit Protection:
                      </p>
                      <p className="text-[11px] leading-relaxed">
                        In accordance with ERP double-entry governance, inventory quantities cannot be manually overwritten on master item edits. 
                        If you need to correct physical count variances or opening stock typos, post an audited contra-entry in the Stock Adjustment module.
                      </p>
                      <div className="flex gap-2 pt-1">
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="sm" 
                          className="h-7 text-xs bg-white dark:bg-card border-blue-300 dark:border-blue-800"
                          onClick={() => {
                            setShowForm(false);
                            navigate(`/inventory/adjustments?itemId=${editing.id}&reason=variance`);
                          }}
                        >
                          <TrendingDown className="w-3 h-3 mr-1 text-amber-600" /> Post Stock Adjustment
                        </Button>
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="sm" 
                          className="h-7 text-xs text-blue-800 dark:text-blue-300"
                          onClick={() => setHistoryItem(editing)}
                        >
                          <History className="w-3 h-3 mr-1" /> View Stock History
                        </Button>
                      </div>
                    </div>

                    <div className="pt-2">
                      <Label>Reorder Alert Level</Label>
                      <Input 
                        type="number" 
                        value={form.reorder_level} 
                        onChange={e => sf('reorder_level', Number(e.target.value))} 
                        placeholder="Minimum stock before reorder warning" 
                        className="max-w-xs mt-1"
                      />
                      <p className="text-[11px] text-muted-foreground mt-1">Triggers low-stock warning when balance drops below this count.</p>
                    </div>
                  </div>
                ) : (
                  /* Create Mode: Optional Opening Stock Initialization */
                  <div className="rounded-lg border border-border p-4 bg-muted/20 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-foreground">Opening Stock Initialization</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Only enable if you are initializing go-live inventory counts</p>
                      </div>
                      <Switch 
                        checked={initOpeningStock} 
                        onCheckedChange={setInitOpeningStock} 
                      />
                    </div>

                    {initOpeningStock ? (
                      <div className="space-y-4 pt-2 border-t border-border">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <Label>Initial Opening Quantity</Label>
                            <Input 
                              type="number" 
                              value={form.quantity_on_hand} 
                              onChange={e => sf('quantity_on_hand', Number(e.target.value))} 
                              placeholder="0"
                              min="0"
                              className="mt-1"
                            />
                            <p className="text-[11px] text-muted-foreground mt-1">Starting physical units in stock.</p>
                          </div>
                          <div>
                            <Label>Unit Purchase / Valuation Cost (NPR) *</Label>
                            <Input 
                              type="number" 
                              value={form.purchase_price} 
                              onChange={e => sf('purchase_price', Number(e.target.value))} 
                              placeholder="0.00"
                              min="0.01"
                              step="0.01"
                              className="mt-1"
                            />
                            <p className="text-[11px] text-muted-foreground mt-1">Cost required to balance opening equity GL journal.</p>
                          </div>
                        </div>

                        <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 rounded-lg p-3 text-xs text-emerald-900 dark:text-emerald-300">
                          <p className="font-semibold">Calculated Opening Valuation:</p>
                          <p className="text-base font-bold font-mono mt-0.5">
                            NPR {(Number(form.quantity_on_hand || 0) * Number(form.purchase_price || 0)).toLocaleString()}
                          </p>
                          <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-1">
                            Will automatically post: Debit <em>Inventory Asset</em>, Credit <em>Opening Stock Equity</em>.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground p-3 bg-muted/40 rounded-lg">
                        Opening stock is off. Item will be created with <strong>0 stock</strong>. Stock can be added later via Purchases or Stock Assembly.
                      </div>
                    )}

                    <div className="pt-2 border-t border-border">
                      <Label>Reorder Alert Level</Label>
                      <Input 
                        type="number" 
                        value={form.reorder_level} 
                        onChange={e => sf('reorder_level', Number(e.target.value))} 
                        placeholder="0" 
                        className="max-w-xs mt-1"
                      />
                      <p className="text-[11px] text-muted-foreground mt-1">Alerts dashboard when stock falls below this quantity.</p>
                    </div>
                  </div>
                )}
              </TabsContent>
            )}

            {/* TAB 3: ACCOUNTING & LEDGER MAPPING */}
            <TabsContent value="accounting" className="space-y-4">
              <div className="bg-muted/40 p-3 rounded-lg border border-border flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  GL Accounts inherited automatically from <strong>{form.category_name || 'Category'}</strong> and Company Settings.
                </span>
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Auto-Configured
                </span>
              </div>

              <FormGrid>
                <div>
                  <Label>Sales / Revenue Account</Label>
                  <SearchableSelect 
                    value={form.sales_account_id} 
                    onChange={v => {
                      const a = accounts.find(a => a.id === v);
                      setForm(prev => ({ ...prev, sales_account_id: v, sales_account_name: a?.account_name || '' }));
                    }}
                    options={(salesAccounts.length > 0 ? salesAccounts : subAccounts).map(a => ({
                      value: a.id,
                      label: a.account_code ? `${a.account_code} — ${a.account_name}` : a.account_name
                    }))}
                    placeholder="Select revenue account…"
                    className="mt-1"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">Credited on sales invoices</p>
                </div>

                <div>
                  <Label>Purchase / COGS Account</Label>
                  <SearchableSelect 
                    value={form.purchase_account_id} 
                    onChange={v => {
                      const a = accounts.find(a => a.id === v);
                      setForm(prev => ({ ...prev, purchase_account_id: v, purchase_account_name: a?.account_name || '' }));
                    }}
                    options={(cogsAccounts.length > 0 ? cogsAccounts : subAccounts).map(a => ({
                      value: a.id,
                      label: a.account_code ? `${a.account_code} — ${a.account_name}` : a.account_name
                    }))}
                    placeholder="Select COGS account…"
                    className="mt-1"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">Debited on purchase bills or cost of sales</p>
                </div>

                {form.item_type !== 'Service' && (
                  <div>
                    <Label>Inventory Asset Account</Label>
                    <SearchableSelect 
                      value={form.inventory_account_id} 
                      onChange={v => {
                        const a = accounts.find(a => a.id === v);
                        setForm(prev => ({ ...prev, inventory_account_id: v, inventory_account_name: a?.account_name || '' }));
                      }}
                      options={(assetAccounts.length > 0 ? assetAccounts : subAccounts).map(a => ({
                        value: a.id,
                        label: a.account_code ? `${a.account_code} — ${a.account_name}` : a.account_name
                      }))}
                      placeholder="Select asset account…"
                      className="mt-1"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">Balance sheet inventory asset</p>
                  </div>
                )}

                <div>
                  <Label>Discount Scheme</Label>
                  <SearchableSelect 
                    value={form.discount_scheme_id} 
                    onChange={v => {
                      const d = discountSchemes.find(d => d.id === v);
                      setForm(prev => ({ ...prev, discount_scheme_id: v, discount_scheme_name: d?.scheme_name || '' }));
                    }}
                    options={discountSchemes.map(d => ({
                      value: d.id,
                      label: `${d.scheme_name} (${d.discount_type === 'Percentage' ? `${d.discount_value}%` : `NPR ${d.discount_value}`})`
                    }))}
                    placeholder="None"
                    className="mt-1"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">Applied automatically on billing</p>
                </div>
              </FormGrid>
            </TabsContent>

            {/* TAB 4: SPECS & MEDIA */}
            <TabsContent value="specs" className="space-y-4">
              <FormGrid>
                <div><Label>Model</Label><Input value={form.attributes?.model || ''} onChange={e => setForm(p => ({ ...p, attributes: { ...p.attributes, model: e.target.value } }))} placeholder="Model number/name" /></div>
                <div><Label>Color</Label><Input value={form.attributes?.color || ''} onChange={e => setForm(p => ({ ...p, attributes: { ...p.attributes, color: e.target.value } }))} placeholder="Color variant" /></div>
                <div><Label>Size / Dimensions</Label><Input value={form.attributes?.size || ''} onChange={e => setForm(p => ({ ...p, attributes: { ...p.attributes, size: e.target.value } }))} placeholder="Size" /></div>
                <div><Label>Weight / GSM</Label><Input value={form.attributes?.weight || ''} onChange={e => setForm(p => ({ ...p, attributes: { ...p.attributes, weight: e.target.value } }))} placeholder="Weight" /></div>
                <FormRow fullWidth><Label>Specifications</Label><Input value={form.attributes?.specifications || ''} onChange={e => setForm(p => ({ ...p, attributes: { ...p.attributes, specifications: e.target.value } }))} placeholder="Detailed specs" /></FormRow>
              </FormGrid>

              {/* Dynamic Metadata */}
              <div className="pt-2 border-t border-border">
                <div className="flex items-center justify-between mb-2">
                  <Label>Custom Metadata Fields</Label>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => {
                    const current = Array.isArray(form.attributes?.custom_metadata) ? form.attributes.custom_metadata : [];
                    setForm(p => ({ ...p, attributes: { ...p.attributes, custom_metadata: [...current, { key: '', value: '' }] } }));
                  }}>
                    <Plus className="w-3 h-3 mr-1" /> Add Field
                  </Button>
                </div>
                <div className="space-y-2">
                  {Array.isArray(form.attributes?.custom_metadata) && form.attributes.custom_metadata.map((meta, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input value={meta.key} onChange={e => {
                        const newMeta = [...form.attributes.custom_metadata];
                        newMeta[i].key = e.target.value;
                        setForm(p => ({ ...p, attributes: { ...p.attributes, custom_metadata: newMeta } }));
                      }} placeholder="Key (e.g. Paper Finish)" className="w-1/3" />
                      <Input value={meta.value} onChange={e => {
                        const newMeta = [...form.attributes.custom_metadata];
                        newMeta[i].value = e.target.value;
                        setForm(p => ({ ...p, attributes: { ...p.attributes, custom_metadata: newMeta } }));
                      }} placeholder="Value (e.g. Glossy)" className="flex-1" />
                      <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-red-500 shrink-0" onClick={() => {
                        const newMeta = form.attributes.custom_metadata.filter((_, idx) => idx !== i);
                        setForm(p => ({ ...p, attributes: { ...p.attributes, custom_metadata: newMeta } }));
                      }}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  {(!form.attributes?.custom_metadata || form.attributes.custom_metadata.length === 0) && (
                    <p className="text-xs text-muted-foreground italic bg-muted/20 p-2 rounded text-center">No custom metadata attributes added.</p>
                  )}
                </div>
              </div>

              {/* Images */}
              <div className="pt-2 border-t border-border">
                <p className="text-xs font-semibold mb-2">Item Images (Max {imgSettings.max_count})</p>
                <div className="flex flex-wrap gap-3 items-start">
                  {(form.image_urls || []).map((url, idx) => (
                    <div key={idx} className="relative w-20 h-20 rounded-lg overflow-hidden border border-border group">
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      <button onClick={() => removeImage(idx)} className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  {(form.image_urls || []).length < imgSettings.max_count && (
                    <label className={`w-20 h-20 border-2 border-dashed border-muted-foreground/30 rounded-lg flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-primary transition-colors ${uploading ? 'opacity-50' : ''}`}>
                      <input type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" disabled={uploading} />
                      {uploading ? <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" /> : <Upload className="w-4 h-4 text-muted-foreground" />}
                      <span className="text-xs text-muted-foreground">{uploading ? 'Uploading…' : 'Upload'}</span>
                    </label>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-4 pt-3 border-t border-border">
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={() => handleSave()} disabled={saving}>
              {saving ? 'Saving...' : editing ? 'Update Item' : 'Create Item'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Audited Price Revision Modal (Replaces window.prompt) */}
      <Dialog open={!!priceRevisionPrompt} onOpenChange={(open) => { if (!open) setPriceRevisionPrompt(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-amber-500" /> Price Revision Audit
            </DialogTitle>
          </DialogHeader>

          {priceRevisionPrompt && (
            <div className="space-y-4 text-sm mt-2">
              <p className="text-xs text-muted-foreground">
                You are updating the selling price for <strong>{priceRevisionPrompt.itemName}</strong>. Statutory audit standards require a mandatory reason for price adjustments.
              </p>

              <div className="flex items-center justify-around p-3 bg-muted/40 rounded-lg border border-border">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Current Price</p>
                  <p className="text-sm font-semibold font-mono text-muted-foreground line-through mt-0.5">
                    NPR {priceRevisionPrompt.oldPrice?.toLocaleString()}
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground" />
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">New Price</p>
                  <p className="text-base font-bold font-mono text-primary mt-0.5">
                    NPR {priceRevisionPrompt.newPrice?.toLocaleString()}
                  </p>
                </div>
              </div>

              <div>
                <Label>Mandatory Revision Reason *</Label>
                <Input 
                  value={priceRevisionReason} 
                  onChange={e => setPriceRevisionReason(e.target.value)}
                  placeholder="e.g. Raw material cost revision, market adjustment" 
                  className="mt-1"
                  autoFocus
                />
              </div>

              <DialogFooter className="pt-2">
                <Button variant="outline" onClick={() => setPriceRevisionPrompt(null)} disabled={revisingPrice}>
                  Cancel
                </Button>
                <Button onClick={executePriceRevisionSave} disabled={revisingPrice || !priceRevisionReason.trim()}>
                  {revisingPrice ? 'Applying…' : 'Confirm Revision & Save'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Transaction History Dialog */}
      <Dialog open={!!historyItem} onOpenChange={() => setHistoryItem(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-4 h-4 text-primary" />
              Transaction History — {historyItem?.item_name}
              <span className="text-xs font-normal text-muted-foreground ml-1">({historyItem?.item_code || 'No code'})</span>
            </DialogTitle>
          </DialogHeader>
          {historyItem && <ItemTransactionHistory item={historyItem} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 pb-1 border-b border-border">{title}</p>
      {children}
    </div>
  );
}