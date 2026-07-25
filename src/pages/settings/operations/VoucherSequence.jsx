import React from 'react';
import { sajilo } from '@/api/sajiloClient';
import SettingPageLayout from '../components/SettingPageLayout';
import { useSettingsStore } from '@/store/settingsStore';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

const VoucherSequence = () => {
  const { draftSettings, updateDraftSettings, setServerSettings, resetDraft } = useSettingsStore();

  const handleSave = async () => {
    try {
      if (draftSettings.id) {
        await sajilo.entities.CompanySettings.update(draftSettings.id, draftSettings);
      }
      setServerSettings({ ...draftSettings });
      toast.success("Voucher Sequence settings saved successfully");
    } catch (e) {
      console.error(e);
      toast.error('Failed to save settings');
    }
  };

  return (
    <SettingPageLayout
      title="Voucher Numbering"
      description="Configure document numbering, prefixes, and duplicate handling for vouchers, invoices, and quotations."
      onSave={handleSave}
      onCancel={resetDraft}
    >
      <div className="space-y-6">
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <h3 className="text-lg font-medium mb-4">Sequence Configuration</h3>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <Label className="text-foreground">Numbering Method</Label>
              <p className="text-xs text-muted-foreground mb-2">Choose how invoice numbers are assigned</p>
              <Select 
                value={draftSettings.invoice_numbering_method || 'Auto'} 
                onValueChange={v => updateDraftSettings({ invoice_numbering_method: v })}
              >
                <SelectTrigger className="h-10 border border-border bg-background px-3 text-sm rounded-md focus:ring-1 focus:ring-primary outline-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Auto">Auto Numbering — system assigns sequential numbers</SelectItem>
                  <SelectItem value="Manual">Manual Numbering — user enters the invoice number</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {draftSettings.invoice_numbering_method === 'Manual' && (
              <div>
                <Label className="text-foreground">Duplicate Number Handling</Label>
                <p className="text-xs text-muted-foreground mb-2">What happens if the same number is entered twice</p>
                <Select 
                  value={draftSettings.invoice_duplicate_handling || 'Block'} 
                  onValueChange={v => updateDraftSettings({ invoice_duplicate_handling: v })}
                >
                  <SelectTrigger className="h-10 border border-border bg-background px-3 text-sm rounded-md focus:ring-1 focus:ring-primary outline-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Block">Block — Reject duplicate numbers entirely</SelectItem>
                    <SelectItem value="Warn">Warn — Show warning but allow proceeding</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          
          {draftSettings.invoice_numbering_method === 'Manual' && (
            <div className={`mt-4 flex items-start gap-2 rounded-lg px-4 py-3 text-sm ${draftSettings.invoice_duplicate_handling === 'Warn' ? 'bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/20 text-yellow-800 dark:text-yellow-300' : 'bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-800 dark:text-red-300'}`}>
              <span className="text-base">{draftSettings.invoice_duplicate_handling === 'Warn' ? '⚠️' : '🚫'}</span>
              <div>
                {draftSettings.invoice_duplicate_handling === 'Warn'
                  ? <><strong>Warn mode:</strong> Users will see a warning if a duplicate invoice number is entered, but can choose to proceed.</>
                  : <><strong>Block mode:</strong> The system will reject any invoice number that already exists in the database — no duplicates allowed.</>
                }
              </div>
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <h3 className="text-lg font-medium mb-1">Document Numbering (Prefix / Suffix)</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Used for Auto Numbering mode. Documents are numbered as: <span className="font-mono bg-muted px-1 rounded">[Prefix]-[Year]-[Number][Suffix]</span>
          </p>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label className="text-foreground">Sales Invoice Prefix</Label>
              <Input value={draftSettings.invoice_prefix_sales || 'SI'} onChange={e => updateDraftSettings({ invoice_prefix_sales: e.target.value })} className="mt-1 h-10 border border-border bg-background px-3 text-sm rounded-md focus:ring-1 focus:ring-primary outline-none font-mono" placeholder="SI" />
            </div>
            <div>
              <Label className="text-foreground">Purchase Invoice Prefix</Label>
              <Input value={draftSettings.invoice_prefix_purchase || 'PI'} onChange={e => updateDraftSettings({ invoice_prefix_purchase: e.target.value })} className="mt-1 h-10 border border-border bg-background px-3 text-sm rounded-md focus:ring-1 focus:ring-primary outline-none font-mono" placeholder="PI" />
            </div>
            <div>
              <Label className="text-foreground">Sales Order Prefix</Label>
              <Input value={draftSettings.invoice_prefix_sales_order || 'SO'} onChange={e => updateDraftSettings({ invoice_prefix_sales_order: e.target.value })} className="mt-1 h-10 border border-border bg-background px-3 text-sm rounded-md focus:ring-1 focus:ring-primary outline-none font-mono" placeholder="SO" />
            </div>
            <div>
              <Label className="text-foreground">Purchase Order Prefix</Label>
              <Input value={draftSettings.invoice_prefix_purchase_order || 'PO'} onChange={e => updateDraftSettings({ invoice_prefix_purchase_order: e.target.value })} className="mt-1 h-10 border border-border bg-background px-3 text-sm rounded-md focus:ring-1 focus:ring-primary outline-none font-mono" placeholder="PO" />
            </div>
            <div>
              <Label className="text-foreground">Quotation Prefix</Label>
              <Input value={draftSettings.quotation_prefix || 'QT'} onChange={e => updateDraftSettings({ quotation_prefix: e.target.value })} className="mt-1 h-10 border border-border bg-background px-3 text-sm rounded-md focus:ring-1 focus:ring-primary outline-none font-mono" placeholder="QT" />
            </div>
            <div>
              <Label className="text-foreground">Common Suffix (optional)</Label>
              <Input value={draftSettings.quotation_suffix || ''} onChange={e => updateDraftSettings({ quotation_suffix: e.target.value })} className="mt-1 h-10 border border-border bg-background px-3 text-sm rounded-md focus:ring-1 focus:ring-primary outline-none font-mono" placeholder="-NP" />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <Label className="text-foreground">Next Invoice/Order Number</Label>
              <Input type="number" min={1} value={draftSettings.invoice_next_number || 1} onChange={e => updateDraftSettings({ invoice_next_number: Number(e.target.value) })} className="mt-1 h-10 border border-border bg-background px-3 text-sm rounded-md focus:ring-1 focus:ring-primary outline-none font-mono text-right" />
            </div>
            <div>
              <Label className="text-foreground">Next Quotation Number</Label>
              <Input type="number" min={1} value={draftSettings.quotation_next_number || 1} onChange={e => updateDraftSettings({ quotation_next_number: Number(e.target.value) })} className="mt-1 h-10 border border-border bg-background px-3 text-sm rounded-md focus:ring-1 focus:ring-primary outline-none font-mono text-right" />
            </div>
          </div>
          
          <p className="text-xs text-muted-foreground bg-muted/40 p-2 rounded mt-6">
            Example: {draftSettings.invoice_prefix_sales || 'SI'}-[Active FY]-{String(draftSettings.invoice_next_number || 1).padStart(5,'0')}{draftSettings.invoice_suffix || ''}
          </p>
        </div>
      </div>
    </SettingPageLayout>
  );
};

export default VoucherSequence;
