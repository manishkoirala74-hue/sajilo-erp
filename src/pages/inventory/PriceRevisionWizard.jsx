import { useState, useEffect } from 'react';
import { sajilo, supabase } from '@/api/sajiloClient';
import { useSajiloSync } from '@/hooks/useSajiloSync';
import PageHeader from '@/components/shared/PageHeader';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Check, Settings2, History, Info } from 'lucide-react';
import SearchableSelect from '@/components/shared/SearchableSelect';
import DataTable from '@/components/shared/DataTable';
import { toast } from 'sonner';

export default function PriceRevisionWizard() {
  const [scope, setScope] = useState('category'); // 'category' or 'individual'
  const [categoryId, setCategoryId] = useState('');
  const [itemId, setItemId] = useState('');
  const [adjType, setAdjType] = useState('PERCENTAGE_CATEGORY');
  const [adjValue, setAdjValue] = useState('');
  const [remarks, setRemarks] = useState('');

  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [previewData, setPreviewData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    sajilo.entities.ItemCategory.list().then(setCategories);
    sajilo.entities.Item.list().then(setItems);
  }, []);

  useSajiloSync(['ItemCategory', 'Item'], () => {
    sajilo.entities.ItemCategory.list().then(setCategories);
    sajilo.entities.Item.list().then(setItems);
  });

  // Handle scope change and reset dependent fields
  const handleScopeChange = (newScope) => {
    setScope(newScope);
    setPreviewData([]);
    if (newScope === 'category') {
      setItemId('');
      setAdjType('PERCENTAGE_CATEGORY');
    } else {
      setCategoryId('');
      setAdjType('MANUAL_INDIVIDUAL');
    }
  };

  const handlePreview = () => {
    if (scope === 'category' && !categoryId) return toast.error('Please select a category');
    if (scope === 'individual' && !itemId) return toast.error('Please select an item');
    if (!adjValue && adjValue !== 0) return toast.error('Please enter an adjustment value');

    const valueNum = parseFloat(adjValue);
    if (isNaN(valueNum)) return toast.error('Invalid adjustment value');

    let affectedItems = [];
    if (scope === 'category') {
      affectedItems = items.filter(i => i.category_id === categoryId && i.is_active);
    } else {
      affectedItems = items.filter(i => i.id === itemId);
    }

    if (affectedItems.length === 0) {
      toast.info('No active items found for the selected scope.');
      setPreviewData([]);
      return;
    }

    const preview = affectedItems.map(item => {
      const oldPrice = Number(item.selling_price || 0);
      let newPrice = oldPrice;

      if (adjType === 'PERCENTAGE_CATEGORY' || adjType === 'PERCENTAGE_INDIVIDUAL') {
        newPrice = Math.round(oldPrice * (1 + (valueNum / 100)));
      } else if (adjType === 'FIXED_AMOUNT_CATEGORY') {
        newPrice = oldPrice + valueNum;
      } else if (adjType === 'MANUAL_INDIVIDUAL') {
        newPrice = valueNum;
      }

      if (newPrice < 0) newPrice = 0;

      return {
        ...item,
        oldPrice,
        newPrice,
        diff: newPrice - oldPrice,
        percentDiff: oldPrice > 0 ? ((newPrice - oldPrice) / oldPrice) * 100 : 0
      };
    });

    setPreviewData(preview);
  };

  const handleSubmit = async () => {
    if (!remarks.trim()) {
      return toast.error('Remarks are mandatory to log the reason for price change.');
    }
    if (previewData.length === 0) {
      return toast.error('Please generate a preview first.');
    }

    setSubmitting(true);
    try {
      const payload = {
        p_company_id: sajilo.getCompanyId(),
        p_category_id: scope === 'category' ? categoryId : null,
        p_item_id: scope === 'individual' ? itemId : null,
        p_adjustment_type: adjType,
        p_adjustment_value: parseFloat(adjValue),
        p_remarks: remarks,
        p_user_id: (await supabase.auth.getUser()).data.user.id
      };

      const { data, error } = await supabase.rpc('apply_price_revision_rpc', payload);
      if (error) throw error;

      toast.success(`Price revision successful. Updated ${data} item(s).`);
      
      // Force cache invalidation manually since RPC bypasses regular Sajilo invalidate
      sajilo.invalidateCache('Item');
      
      setPreviewData([]);
      setRemarks('');
      setAdjValue('');
      if (scope === 'individual') setItemId('');
      else setCategoryId('');

    } catch (err) {
      console.error(err);
      toast.error('Failed to apply price revision: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    { label: 'Item Code', key: 'item_code' },
    { label: 'Item Name', key: 'item_name' },
    { 
      label: 'Old Price', 
      key: 'oldPrice', 
      render: (v) => <span className="text-muted-foreground">NPR {Number(v).toLocaleString()}</span> 
    },
    { 
      label: 'New Price', 
      key: 'newPrice', 
      render: (v) => <span className="font-semibold text-primary">NPR {Number(v).toLocaleString()}</span> 
    },
    { 
      label: 'Difference', 
      key: 'diff', 
      render: (v, row) => (
        <span className={v > 0 ? 'text-green-600' : v < 0 ? 'text-red-600' : 'text-muted-foreground'}>
          {v > 0 ? '+' : ''}{Number(v).toLocaleString()} ({v > 0 ? '+' : ''}{Number(row.percentDiff).toFixed(1)}%)
        </span>
      ) 
    },
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <PageHeader 
        title="Sales Price Revision" 
        description="Bulk update or manually revise sales prices and maintain a strict revision ledger."
        icon={Settings2}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-4 bg-card p-5 rounded-lg border border-border shadow-sm h-fit">
          <h3 className="font-semibold text-sm border-b pb-2 mb-4">Revision Settings</h3>
          
          <div className="space-y-2">
            <Label>Scope</Label>
            <Select value={scope} onValueChange={handleScopeChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="category">Bulk by Category</SelectItem>
                <SelectItem value="individual">Single Item</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {scope === 'category' ? (
            <div className="space-y-2">
              <Label>Category</Label>
              <SearchableSelect
                value={categoryId}
                onValueChange={setCategoryId}
                options={categories.map(c => ({ value: c.id, label: c.category_name }))}
                placeholder="Select category..."
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Item</Label>
              <SearchableSelect
                value={itemId}
                onValueChange={setItemId}
                options={items.map(i => ({ value: i.id, label: i.item_name, sub: i.item_code }))}
                placeholder="Select item..."
              />
            </div>
          )}

          <div className="space-y-2 pt-2 border-t border-border">
            <Label>Adjustment Type</Label>
            <Select value={adjType} onValueChange={setAdjType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {scope === 'category' ? (
                  <>
                    <SelectItem value="PERCENTAGE_CATEGORY">Percentage Change (%)</SelectItem>
                    <SelectItem value="FIXED_AMOUNT_CATEGORY">Fixed Amount Increase/Decrease (NPR)</SelectItem>
                  </>
                ) : (
                  <>
                    <SelectItem value="MANUAL_INDIVIDUAL">Set Exact Price (NPR)</SelectItem>
                    <SelectItem value="PERCENTAGE_INDIVIDUAL">Percentage Change (%)</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>
              {adjType.includes('PERCENTAGE') ? 'Percentage Value (%)' : 'Amount (NPR)'}
            </Label>
            <Input 
              type="number" 
              placeholder={adjType.includes('PERCENTAGE') ? "e.g. 10 for +10%, -5 for -5%" : "Amount"}
              value={adjValue}
              onChange={e => setAdjValue(e.target.value)}
            />
            {adjType === 'PERCENTAGE_CATEGORY' && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <Info className="w-3 h-3" /> Resulting prices will be rounded to nearest whole number.
              </p>
            )}
          </div>

          <div className="pt-4">
            <Button onClick={handlePreview} className="w-full" variant="outline">
              Generate Preview
            </Button>
          </div>
        </div>

        <div className="md:col-span-2 space-y-4">
          <div className="bg-card p-5 rounded-lg border border-border shadow-sm flex flex-col min-h-[400px]">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-sm">Preview Changes</h3>
              {previewData.length > 0 && (
                <Badge variant="secondary">{previewData.length} item(s) affected</Badge>
              )}
            </div>

            {previewData.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground space-y-3">
                <History className="w-12 h-12 opacity-20" />
                <p className="text-sm">Configure settings and click Generate Preview</p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col space-y-4">
                <div className="border border-border rounded-md overflow-hidden flex-1">
                  <DataTable 
                    data={previewData}
                    columns={columns}
                    searchKey="item_name"
                  />
                </div>
                
                <div className="bg-muted/50 p-4 rounded-md border border-border space-y-3">
                  <div className="space-y-1">
                    <Label className="text-destructive font-semibold">Mandatory Remarks (Reason Code)</Label>
                    <Input 
                      placeholder="e.g. Annual markup, Supplier cost increase, Error correction..."
                      value={remarks}
                      onChange={e => setRemarks(e.target.value)}
                      className="border-destructive/30 focus-visible:ring-destructive"
                    />
                  </div>
                  
                  <Alert className="bg-amber-500/10 text-amber-600 border-amber-500/20 py-2">
                    <AlertDescription className="text-xs">
                      This action will update the active sales prices and log the transaction into the immutable Price Revision Ledger.
                    </AlertDescription>
                  </Alert>

                  <Button 
                    onClick={handleSubmit} 
                    disabled={submitting} 
                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
                  >
                    <Check className="w-4 h-4 mr-2" />
                    Commit Price Revision
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
