import { useState, useEffect } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { Search, ShoppingCart, Trash2, Plus, Minus, History, Eye, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import SearchableSelect from '@/components/shared/SearchableSelect';
import VoucherLink from '@/components/shared/VoucherLink';
import FormGrid from '@/components/layout/FormGrid';
import StatusBadge from '@/components/shared/StatusBadge';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useDateFormat } from '@/lib/DateFormatContext';
import { cn } from '@/lib/utils';
import POSSaleDetailModal from '@/components/pos/POSSaleDetailModal';
import { postPOSSale, loadItemsMap, loadSettings } from '@/lib/glPostingService';
import { loadActiveTaxTypes, computeTotalTax } from '@/lib/taxService';
import { useSajiloSync } from '@/hooks/useSajiloSync';
import { useAuth } from '@/lib/AuthContext';

const fmt = n => `NPR ${Number(n || 0).toLocaleString()}`;

export default function POSSales() {
  const { formatDate } = useDateFormat();
  const [items, setItems] = useState([]);
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState('');
  const [customerName, setCustomerName] = useState('Walk-in Customer');
  const [customerId, setCustomerId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [discountPercent, setDiscountPercent] = useState(0);
  const [amountTendered, setAmountTendered] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [lastReceipt, setLastReceipt] = useState(null);
  const [saleCount, setSaleCount] = useState(0);
  const [selectedSale, setSelectedSale] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [cashAccounts, setCashAccounts] = useState([]);
  const [selectedCashAccountId, setSelectedCashAccountId] = useState('');
  const [selectedCashAccountName, setSelectedCashAccountName] = useState('');
  const [taxTypes, setTaxTypes] = useState([]);
  const { globalSettings, hasAccess, activeFiscalYear } = useAuth();
  const [showNegativeStockWarning, setShowNegativeStockWarning] = useState(false);
  const [negativeStockItems, setNegativeStockItems] = useState([]);

  const isCredit = paymentMethod === 'Credit';

  const refreshHistory = async () => {
    const hist = await sajilo.entities.POSSale.list('-created_date', 100);
    setHistory(hist);
    setSaleCount(hist.length);
  };

  const loadData = () => {
    Promise.all([
      sajilo.entities.Item.filter({ is_active: true }, 'item_name', 500),
      sajilo.entities.POSSale.list('-created_date', 100),
      sajilo.entities.BusinessPartner.filter({ is_active: true }, 'name', 500),
      sajilo.entities.ChartOfAccount.filter({ is_active: true }, 'account_code', 1000),
      loadActiveTaxTypes(),
    ]).then(([its, hist, partners, accounts, txTypes]) => {
      setItems(its.filter(i => i.item_type !== 'Raw Material'));
      setHistory(hist);
      setSaleCount(hist.length);
      setCustomers(partners.filter(p => p.is_customer || p.treat_as_customer));
      const drawerAccounts = accounts.filter(a =>
        a.ledger_type === 'Sub Ledger' &&
        a.account_type === 'Asset' &&
        (
          (a.account_name || '').toLowerCase().includes('cash') ||
          (a.account_name || '').toLowerCase().includes('bank') ||
          (a.account_name || '').toLowerCase().includes('petty')
        )
      );
      setCashAccounts(drawerAccounts);
      setTaxTypes(txTypes || []);
      // Auto-select the first drawer account if none selected
      if (drawerAccounts.length > 0 && !selectedCashAccountId) {
        setSelectedCashAccountId(drawerAccounts[0].id);
        setSelectedCashAccountName(drawerAccounts[0].account_name);
      }
    });
  };

  useEffect(() => {
    loadData();
  }, []);

  useSajiloSync(['Item', 'BusinessPartner', 'ChartOfAccount'], loadData);

  const filteredItems = items.filter(i =>
    !search || i.item_name.toLowerCase().includes(search.toLowerCase()) || (i.item_code || '').toLowerCase().includes(search.toLowerCase())
  );

  const addToCart = (item) => {
    setCart(prev => {
      const existing = prev.find(c => c.item_id === item.id);
      if (existing) {
        return prev.map(c => c.item_id === item.id ? { ...c, quantity: c.quantity + 1, line_total: (c.quantity + 1) * c.unit_price } : c);
      }
      return [...prev, {
        item_id: item.id, item_name: item.item_name, item_code: item.item_code,
        hs_code: item.hs_code || '',
        quantity: 1, unit_price: item.selling_price || 0,
        discount_percent: item.discount_scheme_id ? 0 : 0,
        vat_applicable: item.is_vat_applicable || false,
        line_total: item.selling_price || 0,
        unit_of_measure: item.unit_of_measure || 'PCS',
        is_service: item.item_type === 'Service',
      }];
    });
  };

  const updateCartQty = (itemId, delta) => {
    setCart(prev => prev
      .map(c => c.item_id === itemId ? { ...c, quantity: Math.max(0, c.quantity + delta), line_total: Math.max(0, c.quantity + delta) * c.unit_price } : c)
      .filter(c => c.quantity > 0)
    );
  };

  const updateCartDiscount = (itemId, disc) => {
    setCart(prev => prev.map(c => {
      if (c.item_id !== itemId) return c;
      const d = Math.min(100, Math.max(0, parseFloat(disc) || 0));
      return { ...c, discount_percent: d, line_total: c.quantity * c.unit_price * (1 - d / 100) };
    }));
  };

  const removeFromCart = (itemId) => setCart(prev => prev.filter(c => c.item_id !== itemId));

  const subtotal = cart.reduce((s, c) => s + c.line_total, 0);
  const globalDiscount = subtotal * (discountPercent / 100);
  const afterDiscount = subtotal - globalDiscount;
  const { totalTaxAmount: vat } = computeTotalTax(cart, taxTypes);
  const grandTotal = afterDiscount + vat;
  const change = Math.max(0, amountTendered - grandTotal);

  const processSale = async (skipStockCheck = false) => {
    if (cart.length === 0) return toast.error('Cart is empty');
    
    // Negative Stock Policy Check
    const policy = globalSettings?.negative_stock_policy || 'STRICT_BLOCK';
    const negatives = [];
    
    for (const c of cart) {
      if (c.is_service) continue;
      const inventoryItem = items.find(i => i.id === c.item_id);
      const available = inventoryItem?.quantity_on_hand || 0;
      if (c.quantity > available) {
        if (policy === 'STRICT_BLOCK') {
          return toast.error(`Insufficient stock for ${c.item_name}. Max available is ${available}.`);
        } else if (policy === 'WARN_AND_ALLOW' && !skipStockCheck) {
          negatives.push({ name: c.item_name, deficit: c.quantity - available });
        }
      }
    }
    
    if (negatives.length > 0) {
      setNegativeStockItems(negatives);
      setShowNegativeStockWarning(true);
      return;
    }

    if (['Cash', 'Bank'].includes(paymentMethod) && !selectedCashAccountId) {
      toast.error('Select a Cash/Bank ledger account for this POS drawer');
      return;
    }

    setProcessing(true);
    try {
      const idempotencyKey = crypto.randomUUID();
    const saleNum = `POS-${new Date().getFullYear()}-${String(saleCount + 1).padStart(4, '0')}`;
    
    const getSafeDefaultDate = () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      if (activeFiscalYear) {
        if (today > activeFiscalYear.end_date) return activeFiscalYear.end_date;
        if (today < activeFiscalYear.start_date) return activeFiscalYear.start_date;
      }
      return today;
    };

    const sale = {
      sale_number: saleNum,
      sale_date: getSafeDefaultDate(),
      customer_name: customerName || 'Walk-in Customer',
      customer_id: customerId || null,
      payment_method: paymentMethod,
      cash_bank_account_id: !isCredit ? (selectedCashAccountId || null) : null,
      cash_bank_account_name: !isCredit ? (selectedCashAccountName || null) : null,
      subtotal: parseFloat(subtotal.toFixed(2)),
      discount_amount: parseFloat(globalDiscount.toFixed(2)),
      vat_amount: parseFloat(vat.toFixed(2)),
      grand_total: parseFloat(grandTotal.toFixed(2)),
      amount_tendered: amountTendered,
      change_amount: parseFloat(change.toFixed(2)),
      status: 'Completed',
      line_items: cart,
      idempotency_key: idempotencyKey
    };
      const createdSale = await sajilo.entities.POSSale.create(sale);
      const [itemsMap, settings] = await Promise.all([loadItemsMap(cart.map(c => c.item_id)), loadSettings()]);
      await postPOSSale({ ...sale, id: createdSale.id }, itemsMap, settings);
      setLastReceipt(sale);
      setCart([]);
      setCustomerName('Walk-in Customer');
      setDiscountPercent(0);
      setAmountTendered(0);
      setSaleCount(prev => prev + 1);
      toast.success(`Sale ${saleNum} completed!`);
    } catch (err) {
      toast.error(err.message || 'Error occurred while processing POS sale');
    } finally {
      setProcessing(false);
    }
  };

  const isMissingGL = globalSettings && (!globalSettings.gl_accounts_receivable_id || !globalSettings.gl_vat_payable_id || !globalSettings.gl_default_sales_account_id);

  const renderCartContent = () => (
    <>
      {/* Cart Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 text-primary" />
          <span className="font-semibold text-sm">{cart.length} item{cart.length !== 1 ? 's' : ''}</span>
        </div>
        {cart.length > 0 && <button onClick={() => setCart([])} className="text-xs text-red-500 hover:underline">Clear all</button>}
      </div>

      {/* Cart Items */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {cart.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">Add items from the catalog</div>
        ) : cart.map(line => (
          <div key={line.item_id} className="bg-muted/30 rounded-lg p-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{line.item_name}</p>
                <p className="text-xs text-muted-foreground">{fmt(line.unit_price)} each</p>
              </div>
              <button onClick={() => removeFromCart(line.item_id)} className="text-red-400 hover:text-red-600 dark:text-red-400 shrink-0 p-1" aria-label={`Remove ${line.item_name}`}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <button onClick={() => updateCartQty(line.item_id, -1)} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80" aria-label="Decrease quantity">
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="text-sm font-semibold w-8 text-center">{line.quantity}</span>
              <button onClick={() => updateCartQty(line.item_id, 1)} className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center hover:bg-primary/20" aria-label="Increase quantity">
                <Plus className="w-3.5 h-3.5 text-primary" />
              </button>
              <div className="flex items-center gap-1 ml-2">
                <Input type="number" inputMode="decimal" pattern="[0-9]*" onWheel={(e) => e.target.blur()} min={0} max={100} value={line.discount_percent} placeholder="Disc%"
                  onChange={e => updateCartDiscount(line.item_id, e.target.value)}
                  className="h-7 w-16 text-xs text-right px-1" />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
              <span className="ml-auto text-sm font-semibold">{fmt(line.line_total)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Customer & Payment */}
      <div className="border-t border-border px-3 py-3 space-y-2 shrink-0">
        <FormGrid className="gap-2 gap-y-2">
          <div>
            <Label className="text-xs">{isCredit ? 'Customer *' : 'Customer'}</Label>
            {isCredit ? (
              <SearchableSelect
                value={customerId}
                onValueChange={v => {
                  setCustomerId(v);
                  const c = customers.find(p => p.id === v);
                  setCustomerName(c?.name || '');
                }}
                placeholder="Select customer…"
                options={customers.map(c => ({ value: c.id, label: c.name }))}
              />
            ) : (
              <Input value={customerName} onChange={e => setCustomerName(e.target.value)} className="h-8 text-sm" />
            )}
          </div>
          <div>
            <Label className="text-xs">Payment</Label>
            <SearchableSelect
              value={paymentMethod}
              onValueChange={v => { setPaymentMethod(v); if (v !== 'Credit') { setCustomerId(''); setCustomerName('Walk-in Customer'); } }}
              options={[
                { value: 'Cash', label: 'Cash' },
                { value: 'Card', label: 'Card' },
                { value: 'Digital Wallet', label: 'Digital Wallet' },
                { value: 'Credit', label: 'Credit' },
              ]}
            />
          </div>
        </FormGrid>
        {/* Cash drawer selector */}
        {!isCredit && cashAccounts.length > 0 && (
          <div>
            <Label className="text-xs">Cash / Bank Drawer *</Label>
            <SearchableSelect
              value={selectedCashAccountId}
              onValueChange={v => {
                setSelectedCashAccountId(v);
                const acc = cashAccounts.find(a => a.id === v);
                setSelectedCashAccountName(acc?.account_name || '');
              }}
              placeholder="Select drawer account…"
              options={cashAccounts.map(a => ({ value: a.id, label: a.account_name, sub: a.account_code }))}
            />
          </div>
        )}
        <FormGrid className="gap-2 gap-y-2">
          <div>
            <Label className="text-xs">Global Discount %</Label>
            <Input type="number" inputMode="decimal" pattern="[0-9]*" onWheel={(e) => e.target.blur()} min={0} max={100} value={discountPercent} onChange={e => setDiscountPercent(parseFloat(e.target.value) || 0)} className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Amount Tendered</Label>
            <Input type="number" inputMode="decimal" pattern="[0-9]*" onWheel={(e) => e.target.blur()} min={0} value={amountTendered} onChange={e => setAmountTendered(parseFloat(e.target.value) || 0)} className="h-8 text-sm" />
          </div>
        </FormGrid>
      </div>

      {/* Totals */}
      <div className="border-t border-border px-4 py-3 space-y-1 text-sm shrink-0">
        <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
        {globalDiscount > 0 && <div className="flex justify-between text-red-500"><span>Discount ({discountPercent}%)</span><span>-{fmt(globalDiscount)}</span></div>}
        {vat > 0 && <div className="flex justify-between text-muted-foreground"><span>Tax</span><span>{fmt(vat)}</span></div>}
        <div className="flex justify-between font-bold text-base border-t border-border pt-1 mt-1"><span>Total</span><span className="text-primary">{fmt(grandTotal)}</span></div>
        {amountTendered > 0 && <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-semibold"><span>Change</span><span>{fmt(change)}</span></div>}
      </div>

      <div className="px-4 pb-4 shrink-0">
        <Button className="w-full mt-2 h-14 text-lg font-bold shadow-lg rounded-xl"
          onClick={() => processSale()} disabled={cart.length === 0 || processing || isMissingGL}>
          {processing ? 'Processing...' : 'Complete Sale'}
        </Button>
      </div>
    </>
  );

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] relative">
      {isMissingGL && (
        <div className="mb-4 bg-orange-50 border border-orange-200 text-orange-800 px-4 py-3 rounded-lg flex items-start gap-3 shrink-0">
          <AlertCircle className="w-5 h-5 text-orange-600 mt-0.5 shrink-0" />
          <div>
            <h4 className="font-semibold">Action Required: Missing Global Configuration</h4>
            <p className="text-sm mt-1">Default Accounts Receivable, VAT Payable, or Sales GL mappings are missing. Please configure them in Company Settings before using POS.</p>
          </div>
        </div>
      )}
      
      {/* Container for both Desktop and Mobile views */}
      <div className="flex flex-1 gap-4 overflow-hidden pb-[72px] lg:pb-0">
        {/* LEFT — Product Grid (Full width on mobile, flexible on desktop) */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-bold text-foreground">Point of Sale</h2>
            <Button variant="outline" size="sm" onClick={() => setShowHistory(true)}>
              <History className="w-4 h-4 mr-1" /> <span className="hidden sm:inline">Recent Sales</span>
            </Button>
          </div>
          <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2 mb-4">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <input className="flex-1 text-sm outline-none bg-transparent placeholder:text-muted-foreground"
              placeholder="Search items by name or code…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 pb-4">
              {filteredItems.map(item => (
                <button key={item.id} onClick={() => addToCart(item)}
                  className="bg-card border border-border rounded-xl p-3 text-left hover:border-primary hover:shadow-md transition-all group relative">
                  <div className="flex items-start justify-between">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-2 group-hover:bg-primary/20 transition-colors">
                      <ShoppingCart className="w-5 h-5 text-primary" />
                    </div>
                    {item.item_type === 'Service' && (
                      <span className="text-[10px] bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20 px-1.5 py-0.5 rounded font-medium">Service</span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-foreground leading-tight">{item.item_name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.item_code || ''}</p>
                  <p className="text-sm font-bold text-primary mt-1">{fmt(item.selling_price)}</p>
                  {item.item_type !== 'Service' && (
                    <p className={cn('text-xs mt-0.5', item.quantity_on_hand <= 0 ? 'text-red-500' : 'text-muted-foreground')}>
                      {item.quantity_on_hand <= 0 ? 'Out of Stock' : `In Stock: ${item.quantity_on_hand} ${item.unit_of_measure}`}
                    </p>
                  )}
                  {/* Show quantity badge on item card if in cart */}
                  {cart.find(c => c.item_id === item.id) && (
                    <span className="absolute top-2 right-2 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full">
                      {cart.find(c => c.item_id === item.id).quantity} in Cart
                    </span>
                  )}
                </button>
              ))}
              {filteredItems.length === 0 && (
                <div className="col-span-2 xl:col-span-3 py-12 text-center text-muted-foreground text-sm">No items found</div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT — Cart & Checkout (Desktop Fixed Panel) */}
        <div className="hidden lg:flex w-96 flex-col bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          {renderCartContent()}
        </div>
      </div>

      {/* Floating Summary Bar & Sheet (Mobile) */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-primary text-primary-foreground p-3 px-4 flex items-center justify-between z-40 shadow-[0_-4px_10px_rgba(0,0,0,0.1)]">
        <div className="flex flex-col">
          <span className="font-semibold text-base">{cart.length} Item{cart.length !== 1 ? 's' : ''}</span>
          <span className="text-sm font-bold opacity-90">{fmt(grandTotal)}</span>
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="secondary" size="sm" className="font-bold shrink-0 shadow-sm text-primary">
              View Cart
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[90vh] p-0 flex flex-col rounded-t-2xl bg-card border-t border-border focus:outline-none">
            <div className="w-full flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-12 h-1.5 bg-muted-foreground/20 rounded-full" />
            </div>
            {renderCartContent()}
          </SheetContent>
        </Sheet>
      </div>

      {/* Last Receipt Dialog */}
      <Dialog open={!!lastReceipt} onOpenChange={() => setLastReceipt(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-center">Sale Complete ✓</DialogTitle></DialogHeader>
          {lastReceipt && (
            <div className="text-sm space-y-3">
              <div className="text-center text-muted-foreground">
                <p className="font-mono font-bold text-foreground text-base">{lastReceipt.sale_number}</p>
                <p>{lastReceipt.sale_date} • {lastReceipt.payment_method}</p>
                <p>{lastReceipt.customer_name}</p>
              </div>
              <table className="table-fluid-grid text-xs">
                <tbody>{(lastReceipt.line_items || []).map((l, i) => (
                  <tr key={i}><td>{l.quantity}× {l.item_name}</td><td className="cell-density text-right">{fmt(l.line_total)}</td></tr>
                ))}</tbody>
              </table>
              <div className="border-t pt-2 space-y-0.5">
                {lastReceipt.discount_amount > 0 && <div className="flex justify-between text-red-500"><span>Discount</span><span>-{fmt(lastReceipt.discount_amount)}</span></div>}
                {lastReceipt.vat_amount > 0 && <div className="flex justify-between"><span>VAT</span><span>{fmt(lastReceipt.vat_amount)}</span></div>}
                <div className="flex justify-between font-bold"><span>Total</span><span>{fmt(lastReceipt.grand_total)}</span></div>
                {lastReceipt.change_amount > 0 && <div className="flex justify-between text-emerald-600 dark:text-emerald-400"><span>Change</span><span>{fmt(lastReceipt.change_amount)}</span></div>}
              </div>
              <Button className="w-full" onClick={() => setLastReceipt(null)}>New Sale</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* POS Sale Detail Modal */}
      {selectedSale && (
        <POSSaleDetailModal
          sale={selectedSale}
          onClose={() => setSelectedSale(null)}
          onVoided={refreshHistory}
        />
      )}

      {/* History Dialog */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Recent POS Sales</DialogTitle></DialogHeader>
          <table className="table-fluid-grid text-sm">
            <thead className="cell-density bg-muted/50"><tr>
              <th className="cell-density text-left">Sale #</th>
              <th className="cell-density text-left">Date</th>
              <th className="cell-density text-left">Customer</th>
              <th className="cell-density text-left">Payment</th>
              <th className="cell-density text-right">Total</th>
              <th className="cell-density text-center">Status</th>
              <th className="cell-density w-10"></th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {history.map(s => (
                <tr key={s.id} className="hover:bg-muted/20">
                  <td className="cell-density font-mono text-primary font-semibold">{s.sale_number}</td>
                  <td className="cell-density ">{formatDate(s.sale_date)}</td>
                  <td className="cell-density ">{s.customer_name}</td>
                  <td className="cell-density ">{s.payment_method}</td>
                  <td className="cell-density text-right font-semibold">{fmt(s.grand_total)}</td>
                  <td className="cell-density text-center"><StatusBadge status={s.status} /></td>
                  <td className="cell-density ">
                    <Button variant="ghost" size="icon" onClick={() => { setSelectedSale(s); setShowHistory(false); }}>
                      <Eye className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {history.length === 0 && <tr><td colSpan={7} className="cell-density text-center text-muted-foreground">No sales yet</td></tr>}
            </tbody>
          </table>
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
            <p>This POS sale will result in negative stock for the following items:</p>
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
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => setShowNegativeStockWarning(false)}>Cancel</Button>
            {hasAccess('inventory', 'override_negative_stock') && (
              <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={() => { 
                setShowNegativeStockWarning(false); 
                processSale(true); 
              }}>
                Acknowledge & Proceed
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}