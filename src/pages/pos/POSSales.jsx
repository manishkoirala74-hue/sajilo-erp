import { useState, useEffect } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { Search, ShoppingCart, Trash2, Plus, Minus, CreditCard, Banknote, History, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import SearchableSelect from '@/components/shared/SearchableSelect';
import StatusBadge from '@/components/shared/StatusBadge';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useDateFormat } from '@/lib/DateFormatContext';
import { cn } from '@/lib/utils';
import POSSaleDetailModal from '@/components/pos/POSSaleDetailModal';
import { postPOSSale, loadItemsMap, loadSettings } from '@/lib/glPostingService';
import { useSajiloSync } from '@/hooks/useSajiloSync';

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
    ]).then(([its, hist, partners, accounts]) => {
      setItems(its.filter(i => i.item_type !== 'Raw Material'));
      setHistory(hist);
      setSaleCount(hist.length);
      // POS: show customers + suppliers flagged as treat_as_customer
      setCustomers(partners.filter(p => p.is_customer || p.treat_as_customer));
      // Cash & Cash Equivalents: Asset sub-ledgers with cash/bank in name
      setCashAccounts(accounts.filter(a =>
        a.ledger_type === 'Sub Ledger' &&
        a.account_type === 'Asset' &&
        (
          (a.account_name || '').toLowerCase().includes('cash') ||
          (a.account_name || '').toLowerCase().includes('bank') ||
          (a.account_name || '').toLowerCase().includes('petty')
        )
      ));
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
  const vat = cart.reduce((s, c) => c.vat_applicable ? s + c.line_total * 0.13 : s, 0);
  const grandTotal = afterDiscount + vat;
  const change = Math.max(0, amountTendered - grandTotal);

  const processSale = async () => {
    if (cart.length === 0) return toast.error('Cart is empty');
    setProcessing(true);
    const saleNum = `POS-${new Date().getFullYear()}-${String(saleCount + 1).padStart(4, '0')}`;
    const sale = {
      sale_number: saleNum,
      sale_date: format(new Date(), 'yyyy-MM-dd'),
      customer_name: customerName || 'Walk-in Customer',
      payment_method: paymentMethod,
      subtotal: parseFloat(subtotal.toFixed(2)),
      discount_amount: parseFloat(globalDiscount.toFixed(2)),
      vat_amount: parseFloat(vat.toFixed(2)),
      grand_total: parseFloat(grandTotal.toFixed(2)),
      amount_tendered: amountTendered,
      change_amount: parseFloat(change.toFixed(2)),
      status: 'Completed',
      line_items: cart
    };
    const createdSale = await sajilo.entities.POSSale.create(sale);
    // Deduct physical stock
    for (const line of cart) {
      if (!line.is_service && line.item_id) {
        const its = await sajilo.entities.Item.filter({ id: line.item_id });
        if (its[0]) {
          const newQty = Math.max(0, (its[0].quantity_on_hand || 0) - line.quantity);
          await sajilo.entities.Item.update(its[0].id, { quantity_on_hand: newQty });
        }
      }
    }
    // GL Posting
    const [itemsMap, settings] = await Promise.all([loadItemsMap(cart.map(c => c.item_id)), loadSettings()]);
    await postPOSSale({ ...sale, id: createdSale.id }, itemsMap, settings);
    setLastReceipt(sale);
    setCart([]);
    setCustomerName('Walk-in Customer');
    setDiscountPercent(0);
    setAmountTendered(0);
    setSaleCount(prev => prev + 1);
    toast.success(`Sale ${saleNum} completed!`);
    setProcessing(false);
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* LEFT — Product Grid */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold text-foreground">Point of Sale</h2>
          <Button variant="outline" size="sm" onClick={() => setShowHistory(true)}>
            <History className="w-4 h-4 mr-1" /> Recent Sales
          </Button>
        </div>
        <div className="flex items-center gap-2 bg-white border border-border rounded-lg px-3 py-2 mb-4">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input className="flex-1 text-sm outline-none bg-transparent placeholder:text-muted-foreground"
            placeholder="Search items by name or code…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-3 pb-4">
            {filteredItems.map(item => (
              <button key={item.id} onClick={() => addToCart(item)}
                className="bg-white border border-border rounded-xl p-3 text-left hover:border-primary hover:shadow-md transition-all group">
                <div className="flex items-start justify-between">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-2 group-hover:bg-primary/20 transition-colors">
                    <ShoppingCart className="w-5 h-5 text-primary" />
                  </div>
                  {item.item_type === 'Service' && (
                    <span className="text-[10px] bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded font-medium">Service</span>
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
              </button>
            ))}
            {filteredItems.length === 0 && (
              <div className="col-span-3 py-12 text-center text-muted-foreground text-sm">No items found</div>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT — Cart & Checkout */}
      <div className="w-96 flex flex-col bg-white border border-border rounded-2xl overflow-hidden">
        {/* Cart Header */}
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">{cart.length} item{cart.length !== 1 ? 's' : ''}</span>
          </div>
          {cart.length > 0 && <button onClick={() => setCart([])} className="text-xs text-red-500 hover:underline">Clear all</button>}
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
          {cart.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">Add items from the left panel</div>
          ) : cart.map(line => (
            <div key={line.item_id} className="bg-muted/30 rounded-lg p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{line.item_name}</p>
                  <p className="text-xs text-muted-foreground">{fmt(line.unit_price)} each</p>
                </div>
                <button onClick={() => removeFromCart(line.item_id)} className="text-red-400 hover:text-red-600 shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <button onClick={() => updateCartQty(line.item_id, -1)} className="w-6 h-6 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80">
                  <Minus className="w-3 h-3" />
                </button>
                <span className="text-sm font-semibold w-8 text-center">{line.quantity}</span>
                <button onClick={() => updateCartQty(line.item_id, 1)} className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center hover:bg-primary/20">
                  <Plus className="w-3 h-3 text-primary" />
                </button>
                <div className="flex items-center gap-1 ml-2">
                  <Input type="number" min={0} max={100} value={line.discount_percent} placeholder="Disc%"
                    onChange={e => updateCartDiscount(line.item_id, e.target.value)}
                    className="h-6 w-16 text-xs text-right px-1" />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
                <span className="ml-auto text-sm font-semibold">{fmt(line.line_total)}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Customer & Payment */}
        <div className="border-t border-border px-3 py-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
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
          </div>
          {/* Cash account selector for non-credit payments */}
          {!isCredit && cashAccounts.length > 0 && (
            <div>
              <Label className="text-xs">Payment Account (Cash & Cash Equivalents)</Label>
              <SearchableSelect
                value=""
                onValueChange={() => {}}
                placeholder="Default from Settings…"
                options={cashAccounts.map(a => ({ value: a.id, label: a.account_name, sub: a.account_code }))}
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Global Discount %</Label>
              <Input type="number" min={0} max={100} value={discountPercent} onChange={e => setDiscountPercent(parseFloat(e.target.value) || 0)} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Amount Tendered</Label>
              <Input type="number" min={0} value={amountTendered} onChange={e => setAmountTendered(parseFloat(e.target.value) || 0)} className="h-8 text-sm" />
            </div>
          </div>
        </div>

        {/* Totals */}
        <div className="border-t border-border px-4 py-3 space-y-1 text-sm">
          <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
          {globalDiscount > 0 && <div className="flex justify-between text-red-500"><span>Discount ({discountPercent}%)</span><span>-{fmt(globalDiscount)}</span></div>}
          {vat > 0 && <div className="flex justify-between text-muted-foreground"><span>VAT (13%)</span><span>{fmt(vat)}</span></div>}
          <div className="flex justify-between font-bold text-base border-t border-border pt-1 mt-1"><span>Total</span><span className="text-primary">{fmt(grandTotal)}</span></div>
          {amountTendered > 0 && <div className="flex justify-between text-emerald-600 font-semibold"><span>Change</span><span>{fmt(change)}</span></div>}
        </div>

        <div className="px-4 pb-4">
          <Button className="w-full h-11 text-base font-semibold" onClick={processSale} disabled={processing || cart.length === 0}>
            {processing ? 'Processing…' : `Charge ${fmt(grandTotal)}`}
          </Button>
        </div>
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
              <table className="w-full text-xs">
                <tbody>{(lastReceipt.line_items || []).map((l, i) => (
                  <tr key={i}><td>{l.quantity}× {l.item_name}</td><td className="text-right">{fmt(l.line_total)}</td></tr>
                ))}</tbody>
              </table>
              <div className="border-t pt-2 space-y-0.5">
                {lastReceipt.discount_amount > 0 && <div className="flex justify-between text-red-500"><span>Discount</span><span>-{fmt(lastReceipt.discount_amount)}</span></div>}
                {lastReceipt.vat_amount > 0 && <div className="flex justify-between"><span>VAT</span><span>{fmt(lastReceipt.vat_amount)}</span></div>}
                <div className="flex justify-between font-bold"><span>Total</span><span>{fmt(lastReceipt.grand_total)}</span></div>
                {lastReceipt.change_amount > 0 && <div className="flex justify-between text-emerald-600"><span>Change</span><span>{fmt(lastReceipt.change_amount)}</span></div>}
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
          <table className="w-full text-sm">
            <thead className="bg-muted/50"><tr>
              <th className="px-3 py-2 text-left">Sale #</th>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Customer</th>
              <th className="px-3 py-2 text-left">Payment</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-center">Status</th>
              <th className="px-3 py-2 w-10"></th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {history.map(s => (
                <tr key={s.id} className="hover:bg-muted/20">
                  <td className="px-3 py-2 font-mono text-primary font-semibold">{s.sale_number}</td>
                  <td className="px-3 py-2">{formatDate(s.sale_date)}</td>
                  <td className="px-3 py-2">{s.customer_name}</td>
                  <td className="px-3 py-2">{s.payment_method}</td>
                  <td className="px-3 py-2 text-right font-semibold">{fmt(s.grand_total)}</td>
                  <td className="px-3 py-2 text-center"><StatusBadge status={s.status} /></td>
                  <td className="px-3 py-2">
                    <Button variant="ghost" size="icon" onClick={() => { setSelectedSale(s); setShowHistory(false); }}>
                      <Eye className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {history.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">No sales yet</td></tr>}
            </tbody>
          </table>
        </DialogContent>
      </Dialog>
    </div>
  );
}