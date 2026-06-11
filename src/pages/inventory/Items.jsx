import { useSearchParams } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { loadActiveTaxTypes } from '@/lib/taxService';
import { Plus, Edit2, Package, AlertTriangle, Upload, X, History, CheckSquare, Square, Minus, Trash2 } from 'lucide-react';
import ItemTransactionHistory from '@/components/inventory/ItemTransactionHistory';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import PageHeader from '@/components/shared/PageHeader';
import StatusBadge from '@/components/shared/StatusBadge';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { postItemDeletionWriteOff, loadSettings } from '@/lib/glPostingService';

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
  description: '', barcode: '', hs_code: ''
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
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
            <span className="text-xs text-red-700 font-medium">Confirm delete {selectedIds.length} item(s)?</span>
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
  

  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [uoms, setUoms] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [discountSchemes, setDiscountSchemes] = useState([]);
  const [taxTypes, setTaxTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyItem);
  const [saving, setSaving] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [uploading, setUploading] = useState(false);
  const [imgSettings, setImgSettings] = useState({ max_size_mb: 2, max_count: 3 });
  const [historyItem, setHistoryItem] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    Promise.all([
      sajilo.entities.Item.list('-created_date'),
      sajilo.entities.ItemCategory.list('category_name'),
      sajilo.entities.UnitOfMeasure.filter({ is_active: true }, 'uom_code', 200),
      sajilo.entities.ChartOfAccount.filter({ is_active: true }, 'account_code', 500),
      sajilo.entities.DiscountScheme.filter({ is_active: true }, 'scheme_name', 200),
      sajilo.entities.CompanySettings.list(),
      loadActiveTaxTypes(),
    ]).then(([its, cats, us, accs, ds, cs, txTypes]) => {
      setItems(its);
      setCategories(cats);
      setUoms(us);
      setAccounts(accs);
      setDiscountSchemes(ds);
      setTaxTypes((txTypes || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)));
      if (cs[0]) setImgSettings({ max_size_mb: cs[0].item_image_max_size_mb || 2, max_count: cs[0].item_image_max_count || 3 });
      setLoading(false);
    });
  }, []);
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      openNew();
      searchParams.delete('new');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);


  const fetchItems = async () => {
    const data = await sajilo.entities.Item.list('-created_date');
    setItems(data);
  };

  const openNew = () => { 
    const defSales = accounts.find(a => a.account_code === '4100');
    const defCogs = accounts.find(a => a.account_code === '5100');
    const defInv = accounts.find(a => a.account_code === '1132');

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
    setShowForm(true); 
  };
  const openEdit = (item) => {
    setForm({
      ...item,
      image_urls: item.image_urls || (item.image_url ? [item.image_url] : []),
      tax_type_ids: Array.isArray(item.tax_type_ids) ? item.tax_type_ids : (item.tax_type_ids ? JSON.parse(item.tax_type_ids) : []),
    });
    setEditing(item);
    setShowForm(true);
  };

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    const currentCount = (form.image_urls || []).length;
    const remaining = imgSettings.max_count - currentCount;
    if (remaining <= 0) { toast.error(`Max ${imgSettings.max_count} images allowed`); return; }
    const toUpload = files.slice(0, remaining);
    for (const file of toUpload) {
      if (file.size > imgSettings.max_size_mb * 1024 * 1024) {
        toast.error(`"${file.name}" exceeds ${imgSettings.max_size_mb}MB limit`); continue;
      }
      setUploading(true);
      const { file_url } = await sajilo.integrations.Core.UploadFile({ file });
      setForm(prev => ({ ...prev, image_urls: [...(prev.image_urls || []), file_url], image_url: file_url }));
      setUploading(false);
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
    setSaving(true);
    try {
      const { image_urls, total_asset_value, ...payload } = form;
      // Derive is_vat_applicable from tax_type_ids for backward compatibility
      const taxIds = Array.isArray(form.tax_type_ids) ? form.tax_type_ids : [];
      payload.tax_type_ids = taxIds;
      payload.is_vat_applicable = taxIds.length > 0;
      if (editing) {
        await sajilo.entities.Item.update(editing.id, payload);
        toast.success('Item updated');
      } else {
        await sajilo.entities.Item.create(payload);
        toast.success('Item created');
      }
    } catch (err) {
      toast.error(err.message || 'Error occurred while saving');
    } finally {
      setSaving(false);
    }
    setShowForm(false);
    fetchItems();
  };

  const handleBulkUpdate = async (ids, data) => {
    await Promise.all(ids.map(id => sajilo.entities.Item.update(id, data)));
    toast.success(`Updated ${ids.length} item(s)`);
    setSelectedIds([]);
    fetchItems();
  };

  const handleResetWac = async (ids) => {
    const itemsToUpdate = items.filter(i => ids.includes(i.id));
    await Promise.all(itemsToUpdate.map(item => sajilo.entities.Item.update(item.id, {
      weighted_average_cost: item.purchase_price || 0,
      current_unit_cost: item.purchase_price || 0,
    })));
    toast.success(`Reset WAC to Purchase Price for ${ids.length} item(s)`);
    setSelectedIds([]);
    fetchItems();
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
    fetchItems();
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
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filterType === f.key ? 'bg-primary text-white' : 'bg-white border border-border text-muted-foreground hover:bg-muted'}`}>
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
              className={cn('px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors', allCatSel ? 'bg-primary/10 border-primary text-primary' : 'bg-white border-border text-muted-foreground hover:bg-muted')}>
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
      <div className="bg-white border border-border rounded-xl overflow-hidden">
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

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8 space-y-3">
              {Array(6).fill(0).map((_, i) => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">No items found</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border">
                <tr>
                  <th className="w-10 px-3 py-2.5" />
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground">Item</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground">Category</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground">Type</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground">UOM</th>
                  <th className="text-right px-3 py-2.5 text-xs font-semibold text-muted-foreground">Stock</th>
                  <th className="text-right px-3 py-2.5 text-xs font-semibold text-muted-foreground">Sell Price</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground">Sales A/c</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground">Purchase A/c</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground">HS Code</th>
                  <th className="text-center px-3 py-2.5 text-xs font-semibold text-muted-foreground">Status</th>
                  <th className="px-3 py-2.5 w-20" />
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
                      <td className="px-3 py-2.5">
                        <button onClick={() => toggleSelectItem(item.id)} className="flex items-center justify-center">
                          {isSelected
                            ? <CheckSquare className="w-4 h-4 text-primary" />
                            : <Square className="w-4 h-4 text-muted-foreground" />
                          }
                        </button>
                      </td>
                      {/* Item */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-3">
                          {(item.image_url || (item.image_urls && item.image_urls[0])) ? (
                            <img src={item.image_url || item.image_urls[0]} alt={item.item_name} className="w-8 h-8 rounded-lg object-cover border border-border shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                              <Package className="w-3.5 h-3.5 text-indigo-500" />
                            </div>
                          )}
                          <div>
                            <p className="font-medium">{item.item_name}</p>
                            <p className="text-xs text-muted-foreground">{item.item_code || '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-sm text-muted-foreground">{item.category_name || '—'}</td>
                      <td className="px-3 py-2.5 text-sm">{item.item_type}</td>
                      <td className="px-3 py-2.5 text-sm text-muted-foreground">{item.unit_of_measure}</td>
                      <td className="px-3 py-2.5 text-right">
                        {item.item_type === 'Service'
                          ? <span className="text-xs text-blue-500 italic">N/A</span>
                          : <div className="flex items-center justify-end gap-1">
                              <span className={cn('font-semibold', item.quantity_on_hand <= item.reorder_level && item.reorder_level > 0 ? 'text-red-600' : '')}>
                                {item.quantity_on_hand}
                              </span>
                              {item.quantity_on_hand <= item.reorder_level && item.reorder_level > 0 && <AlertTriangle className="w-3 h-3 text-red-500" />}
                            </div>
                        }
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-sm">NPR {Number(item.selling_price).toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-xs">
                        {item.sales_account_name
                          ? <span className="text-muted-foreground">{item.sales_account_name}</span>
                          : <span className="text-red-400">Not mapped</span>
                        }
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        {item.purchase_account_name
                          ? <span className="text-muted-foreground">{item.purchase_account_name}</span>
                          : <span className="text-red-400">Not mapped</span>
                        }
                      </td>
                      <td className="px-3 py-2.5 text-xs font-mono text-muted-foreground">{item.hs_code || '—'}</td>
                      <td className="px-3 py-2.5 text-center">
                        <StatusBadge status={item.is_active ? 'Active' : 'Inactive'} />
                      </td>
                      <td className="px-3 py-2.5">
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

      {/* Item Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Item' : 'New Item'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-6 mt-2">
            <Section title="Basic Information">
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Item Code</Label><Input value={form.item_code} onChange={e => sf('item_code', e.target.value)} placeholder="SKU-001" /></div>
                <div><Label>Item Name *</Label><Input value={form.item_name} onChange={e => sf('item_name', e.target.value)} placeholder="Product name" /></div>
                <div>
                  <Label>Category</Label>
                  <Select value={form.category_id} onValueChange={v => {
                    const cat = categories.find(c => c.id === v);
                    setForm(prev => ({
                      ...prev, category_id: v, category_name: cat?.category_name || '',
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
                  <Label>Item Type</Label>
                  <Select value={form.item_type} onValueChange={v => sf('item_type', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['Product', 'Service', 'Raw Material', 'Semi-Finished Good', 'Finished Good'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Barcode</Label><Input value={form.barcode || ''} onChange={e => sf('barcode', e.target.value)} placeholder="Barcode / SKU" /></div>
                <div><Label>HS Code</Label><Input value={form.hs_code || ''} onChange={e => sf('hs_code', e.target.value)} placeholder="e.g. 8471.30" /></div>
                <div className="col-span-2"><Label>Description</Label><Input value={form.description} onChange={e => sf('description', e.target.value)} placeholder="Optional" /></div>
              </div>
            </Section>

            <Section title="Units of Measure">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Stock UOM</Label>
                  <Select value={form.unit_of_measure} onValueChange={v => sf('unit_of_measure', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{uomOptions.map(u => <SelectItem key={u.uom_code} value={u.uom_code}>{u.uom_code} — {u.uom_name}</SelectItem>)}</SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">Base unit for inventory</p>
                </div>
                <div>
                  <Label>Purchase UOM</Label>
                  <Select value={form.purchase_uom || form.unit_of_measure} onValueChange={v => sf('purchase_uom', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{uomOptions.map(u => <SelectItem key={u.uom_code} value={u.uom_code}>{u.uom_code} — {u.uom_name}</SelectItem>)}</SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">UOM on purchase docs</p>
                </div>
                <div>
                  <Label>Sales UOM</Label>
                  <Select value={form.sales_uom || form.unit_of_measure} onValueChange={v => sf('sales_uom', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{uomOptions.map(u => <SelectItem key={u.uom_code} value={u.uom_code}>{u.uom_code} — {u.uom_name}</SelectItem>)}</SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">UOM on sales docs</p>
                </div>
              </div>
            </Section>

            <Section title="Pricing & Stock">
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Selling Price (NPR)</Label><Input type="number" value={form.selling_price} onChange={e => sf('selling_price', Number(e.target.value))} /></div>
                <div><Label>Purchase Price (NPR)</Label><Input type="number" value={form.purchase_price} onChange={e => sf('purchase_price', Number(e.target.value))} /></div>
                <div><Label>Opening Stock Qty</Label><Input type="number" value={form.quantity_on_hand} onChange={e => sf('quantity_on_hand', Number(e.target.value))} /></div>
                <div><Label>Reorder Level</Label><Input type="number" value={form.reorder_level} onChange={e => sf('reorder_level', Number(e.target.value))} /></div>
              </div>
            </Section>

            <Section title="Account Mapping">
              <p className="text-xs text-muted-foreground mb-3">Link this item to Chart of Accounts for automatic journal entries.</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Purchase / COGS Account</Label>
                  <Select value={form.purchase_account_id} onValueChange={v => {
                    const a = accounts.find(a => a.id === v);
                    setForm(prev => ({ ...prev, purchase_account_id: v, purchase_account_name: a?.account_name || '' }));
                  }}>
                    <SelectTrigger><SelectValue placeholder="Select account…" /></SelectTrigger>
                    <SelectContent>{(cogsAccounts.length > 0 ? cogsAccounts : subAccounts).map(a => <SelectItem key={a.id} value={a.id}>{a.account_code ? `${a.account_code} — ` : ''}{a.account_name}</SelectItem>)}</SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">Debited on purchase posting</p>
                </div>
                <div>
                  <Label>Sales / Revenue Account</Label>
                  <Select value={form.sales_account_id} onValueChange={v => {
                    const a = accounts.find(a => a.id === v);
                    setForm(prev => ({ ...prev, sales_account_id: v, sales_account_name: a?.account_name || '' }));
                  }}>
                    <SelectTrigger><SelectValue placeholder="Select account…" /></SelectTrigger>
                    <SelectContent>{(salesAccounts.length > 0 ? salesAccounts : subAccounts).map(a => <SelectItem key={a.id} value={a.id}>{a.account_code ? `${a.account_code} — ` : ''}{a.account_name}</SelectItem>)}</SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">Credited on sales posting</p>
                </div>
                <div>
                  <Label>Inventory Asset Account</Label>
                  <Select value={form.inventory_account_id} onValueChange={v => {
                    const a = accounts.find(a => a.id === v);
                    setForm(prev => ({ ...prev, inventory_account_id: v, inventory_account_name: a?.account_name || '' }));
                  }}>
                    <SelectTrigger><SelectValue placeholder="Select account…" /></SelectTrigger>
                    <SelectContent>{(assetAccounts.length > 0 ? assetAccounts : subAccounts).map(a => <SelectItem key={a.id} value={a.id}>{a.account_code ? `${a.account_code} — ` : ''}{a.account_name}</SelectItem>)}</SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">Tracks stock value on balance sheet</p>
                </div>
                <div>
                  <Label>Discount Scheme</Label>
                  <Select value={form.discount_scheme_id} onValueChange={v => {
                    const d = discountSchemes.find(d => d.id === v);
                    setForm(prev => ({ ...prev, discount_scheme_id: v, discount_scheme_name: d?.scheme_name || '' }));
                  }}>
                    <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={null}>None</SelectItem>
                      {discountSchemes.map(d => <SelectItem key={d.id} value={d.id}>{d.scheme_name} ({d.discount_type === 'Percentage' ? `${d.discount_value}%` : `NPR ${d.discount_value}`})</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">Applied automatically on sales</p>
                </div>
              </div>
            </Section>

            <Section title={`Item Images (max ${imgSettings.max_count} images, ${imgSettings.max_size_mb}MB each)`}>
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
              <p className="text-xs text-muted-foreground mt-2">{(form.image_urls || []).length}/{imgSettings.max_count} images • Max {imgSettings.max_size_mb}MB per image</p>
            </Section>

            {/* Tax Types — Multi-Select */}
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold">Applicable Tax Types</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Select one or more taxes for this item. Taxes are applied in Sort Order (lowest first).
                  Compound taxes are calculated on net + prior taxes.
                </p>
              </div>

              {taxTypes.length === 0 ? (
                <p className="text-xs text-amber-600 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  No tax types configured. Go to Settings → Tax & VAT to create them.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {taxTypes.map(tt => {
                    const selected = (form.tax_type_ids || []).includes(tt.id);
                    const toggle = () => {
                      const ids = form.tax_type_ids || [];
                      sf('tax_type_ids', selected ? ids.filter(x => x !== tt.id) : [...ids, tt.id]);
                    };
                    return (
                      <label key={tt.id}
                        className={cn(
                          'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                          selected
                            ? 'bg-primary/5 border-primary/40 ring-1 ring-primary/20'
                            : 'bg-white border-border hover:bg-muted/40'
                        )}
                      >
                        <Checkbox checked={selected} onCheckedChange={toggle} className="mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">{tt.tax_name}</span>
                            <span className="text-xs font-semibold tabular-nums text-primary bg-primary/10 px-1.5 py-0.5 rounded">{tt.tax_rate}%</span>
                            {tt.is_compound && (
                              <span className="text-xs text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded">Compound</span>
                            )}
                            {tt.sort_order != null && (
                              <span className="text-xs text-muted-foreground">#{tt.sort_order}</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {tt.tax_type} · {tt.applies_to}
                            {tt.tax_code ? ` · ${tt.tax_code}` : ''}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}

              {(form.tax_type_ids || []).length > 1 && (() => {
                // Show cascade preview
                const sorted = (form.tax_type_ids || [])
                  .map(id => taxTypes.find(t => t.id === id))
                  .filter(Boolean)
                  .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
                const base = 100;
                let cum = 0;
                const steps = sorted.map(tt => {
                  const taxBase = tt.is_compound ? base + cum : base;
                  const tax = Math.round(taxBase * Number(tt.tax_rate) / 100 * 100) / 100;
                  cum += tax;
                  return { name: tt.tax_name, rate: tt.tax_rate, tax };
                });
                return (
                  <div className="bg-blue-50 border border-blue-100 rounded px-3 py-2 text-xs">
                    <p className="font-semibold text-blue-900 mb-1">Cascade Preview on Net=100:</p>
                    {steps.map((s, i) => (
                      <p key={i} className="font-mono text-blue-800">{s.name} ({s.rate}%) = {s.tax}</p>
                    ))}
                    <p className="font-mono font-semibold text-blue-900 border-t border-blue-200 mt-1 pt-1">
                      Total Tax = {steps.reduce((s, x) => s + x.tax, 0).toFixed(2)} → Grand Total = {(100 + steps.reduce((s, x) => s + x.tax, 0)).toFixed(2)}
                    </p>
                  </div>
                );
              })()}
            </div>

            <div className="flex items-center gap-6 bg-muted/50 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <Switch checked={form.is_active} onCheckedChange={v => sf('is_active', v)} />
                <Label>Active</Label>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editing ? 'Update' : 'Create'}</Button>
          </div>
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