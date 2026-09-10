import React, { useState, useEffect, useCallback } from 'react';
import { sajilo } from '@/api/sajiloClient';
import SettingPageLayout from '../components/SettingPageLayout';
import { useSettingsStore } from '@/store/settingsStore';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Hash, Sparkles, AlertTriangle, RefreshCw } from 'lucide-react';

const DEFAULT_DOC_TYPES = [
  { type: 'SalesInvoice', label: 'Sales Invoice', prefix: 'SI', padding: 5, include_fy_prefix: true },
  { type: 'PurchaseInvoice', label: 'Purchase Invoice', prefix: 'PI', padding: 5, include_fy_prefix: true },
  { type: 'SalesOrder', label: 'Sales Order', prefix: 'SO', padding: 5, include_fy_prefix: true },
  { type: 'PurchaseOrder', label: 'Purchase Order', prefix: 'PO', padding: 5, include_fy_prefix: true },
  { type: 'Quotation', label: 'Quotation', prefix: 'QT', padding: 5, include_fy_prefix: true },
  { type: 'Receipt', label: 'Receipt Voucher', prefix: 'RV', padding: 5, include_fy_prefix: true },
  { type: 'Payment', label: 'Payment Voucher', prefix: 'PV', padding: 5, include_fy_prefix: true },
  { type: 'Journal', label: 'Journal Voucher', prefix: 'JV', padding: 5, include_fy_prefix: true },
  { type: 'Contra', label: 'Contra Voucher', prefix: 'CV', padding: 5, include_fy_prefix: true },
  { type: 'StockAdjustment', label: 'Stock Adjustment', prefix: 'ADJ', padding: 5, include_fy_prefix: true },
];

const VoucherSequence = () => {
  const { draftSettings, updateDraftSettings, setServerSettings, resetDraft } = useSettingsStore();
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [companyStatus, setCompanyStatus] = useState('ACTIVE');
  const [activeFyName, setActiveFyName] = useState('');

  // Fetch active company details & fiscal year name to enforce Ghost Mode checklist rules & dynamic FY preview
  useEffect(() => {
    const fetchCompanyAndFY = async () => {
      try {
        const companyId = sajilo.getCompanyId();
        if (companyId) {
          const comp = await sajilo.entities.Company.get(companyId);
          if (comp?.status) setCompanyStatus(comp.status);
        }

        const fyList = await sajilo.entities.FiscalYear.list();
        if (fyList && fyList.length > 0) {
          const today = new Date().toISOString().split('T')[0];
          const currentFy = fyList.find(fy => fy.status === 'OPEN' || (today >= fy.start_date && today <= fy.end_date)) || fyList[0];
          if (currentFy?.fiscal_year_name) {
            setActiveFyName(currentFy.fiscal_year_name);
          }
        }
      } catch (err) {
        console.error("Failed to fetch company status or fiscal year", err);
      }
    };
    fetchCompanyAndFY();
  }, []);

  const isGhostMode = companyStatus === 'PENDING_DELETION';

  // Fetch or Seed Sequence Configs
  const loadSequenceConfigs = useCallback(async () => {
    setLoading(true);
    try {
      let existing = await sajilo.entities.DocumentSequenceConfig.list();
      
      // Ensure all standard document types are present
      const companyId = sajilo.getCompanyId();
      if (!companyId) {
        setLoading(false);
        return;
      }

      const existingMap = new Map(existing.map(c => [c.document_type, c]));
      const itemsToSeed = [];

      for (const def of DEFAULT_DOC_TYPES) {
        if (!existingMap.has(def.type)) {
          itemsToSeed.push({
            company_id: companyId,
            document_type: def.type,
            document_label: def.label,
            prefix: def.prefix,
            suffix: '',
            padding: def.padding,
            include_fy_prefix: def.include_fy_prefix,
            starting_number: 1,
            is_active: true,
          });
        }
      }

      if (itemsToSeed.length > 0) {
        for (const item of itemsToSeed) {
          await sajilo.entities.DocumentSequenceConfig.create(item);
        }
        existing = await sajilo.entities.DocumentSequenceConfig.list();
      }

      setConfigs(existing);
    } catch (err) {
      console.error("Failed to load document sequence configs:", err);
      toast.error("Failed to load document sequence configurations.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSequenceConfigs();
  }, [loadSequenceConfigs]);

  const handleConfigChange = (index, field, value) => {
    setConfigs(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleSave = async () => {
    if (isGhostMode) {
      toast.error("Account is pending deletion. Modifications are disabled in Ghost Mode.");
      return;
    }
    setSaving(true);
    try {
      // 1. Update CompanySettings
      if (draftSettings.id) {
        await sajilo.entities.CompanySettings.update(draftSettings.id, draftSettings);
      }
      setServerSettings({ ...draftSettings });

      // 2. Batch update DocumentSequenceConfig rows
      for (const config of configs) {
        if (config.id) {
          await sajilo.entities.DocumentSequenceConfig.update(config.id, {
            prefix: config.prefix || '',
            suffix: config.suffix || '',
            padding: Math.max(2, Math.min(10, Number(config.padding) || 5)),
            include_fy_prefix: config.include_fy_prefix ?? true,
            starting_number: Math.max(1, Number(config.starting_number) || 1),
            is_active: config.is_active ?? true,
          });
        }
      }

      toast.success("Document numbering & sequence settings saved successfully!");
      loadSequenceConfigs();
    } catch (e) {
      console.error("Error saving sequence settings:", e);
      toast.error("Failed to save sequence settings.");
    } finally {
      setSaving(false);
    }
  };

  const renderLivePreview = (cfg) => {
    const prefix = cfg.prefix ? (cfg.prefix.endsWith('-') || cfg.prefix.endsWith('/') ? cfg.prefix : `${cfg.prefix}-`) : '';
    const fyPart = cfg.include_fy_prefix ? `${activeFyName || '2026/27'}-` : '';
    const startNo = Math.max(1, Number(cfg.starting_number) || 1);
    const padding = Math.max(2, Math.min(10, Number(cfg.padding) || 5));
    const numPart = String(startNo).padStart(padding, '0');
    const suffix = cfg.suffix || '';

    return `${prefix}${fyPart}${numPart}${suffix}`;
  };

  return (
    <SettingPageLayout
      title="Voucher & Document Numbering"
      description="Configure dynamic document numbering, auto-sequences, zero-padding, and custom prefixes across modules."
      onSave={handleSave}
      onCancel={resetDraft}
      saveDisabled={saving || loading || isGhostMode}
    >
      <div className="space-y-6">
        {/* Ghost Mode Alert */}
        {isGhostMode && (
          <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-400 p-4 rounded-xl text-sm">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <div>
              <strong>Ghost Mode Active:</strong> Company is scheduled for deletion. Settings are read-only.
            </div>
          </div>
        )}

        {/* Global Strategy Card */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
            <Hash className="h-5 w-5 text-primary" /> Global Numbering Strategy
          </h3>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <Label className="text-foreground">Numbering Method</Label>
              <p className="text-xs text-muted-foreground mb-2">Choose how transaction numbers are assigned system-wide</p>
              <Select 
                value={draftSettings.invoice_numbering_method || 'Auto'} 
                onValueChange={v => updateDraftSettings({ invoice_numbering_method: v })}
                disabled={isGhostMode}
              >
                <SelectTrigger className="h-10 border border-border bg-background px-3 text-sm rounded-md focus:ring-1 focus:ring-primary outline-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Auto">Auto Numbering — Database kernel assigns sequential numbers</SelectItem>
                  <SelectItem value="Manual">Manual Numbering — User manually enters voucher numbers</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {draftSettings.invoice_numbering_method === 'Manual' && (
              <div>
                <Label className="text-foreground">Duplicate Number Handling</Label>
                <p className="text-xs text-muted-foreground mb-2">Policy for duplicate manual entries</p>
                <Select 
                  value={draftSettings.invoice_duplicate_handling || 'Block'} 
                  onValueChange={v => updateDraftSettings({ invoice_duplicate_handling: v })}
                  disabled={isGhostMode}
                >
                  <SelectTrigger className="h-10 border border-border bg-background px-3 text-sm rounded-md focus:ring-1 focus:ring-primary outline-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Block">Block — Reject duplicate numbers completely</SelectItem>
                    <SelectItem value="Warn">Warn — Display warning but allow proceeding</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        {/* Dynamic Document Sequence Grid */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-medium">Dynamic Document Sequences</h3>
              <p className="text-xs text-muted-foreground">
                Configurable per-module sequence rules. Numbers automatically reset per Fiscal Year.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={loadSequenceConfigs} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading sequence configurations...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {configs.map((cfg, idx) => (
                <div key={cfg.id || idx} className="border border-border/70 bg-background/50 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-border pb-2">
                    <span className="font-semibold text-sm text-foreground">{cfg.document_label || cfg.document_type}</span>
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`active-${cfg.id}`} className="text-xs text-muted-foreground">Active</Label>
                      <Switch
                        id={`active-${cfg.id}`}
                        checked={cfg.is_active ?? true}
                        onCheckedChange={checked => handleConfigChange(idx, 'is_active', checked)}
                        disabled={isGhostMode}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs">Prefix</Label>
                      <Input
                        value={cfg.prefix || ''}
                        onChange={e => handleConfigChange(idx, 'prefix', e.target.value)}
                        placeholder="SI"
                        className="h-8 text-xs font-mono"
                        disabled={isGhostMode}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Suffix</Label>
                      <Input
                        value={cfg.suffix || ''}
                        onChange={e => handleConfigChange(idx, 'suffix', e.target.value)}
                        placeholder="-NP"
                        className="h-8 text-xs font-mono"
                        disabled={isGhostMode}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Zero Padding</Label>
                      <Input
                        type="number"
                        min={2}
                        max={10}
                        value={cfg.padding || 5}
                        onChange={e => handleConfigChange(idx, 'padding', e.target.value)}
                        className="h-8 text-xs font-mono text-right"
                        disabled={isGhostMode}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2">
                      <Switch
                        id={`fy-${cfg.id}`}
                        checked={cfg.include_fy_prefix ?? true}
                        onCheckedChange={checked => handleConfigChange(idx, 'include_fy_prefix', checked)}
                        disabled={isGhostMode}
                      />
                      <Label htmlFor={`fy-${cfg.id}`} className="text-xs text-muted-foreground flex items-center gap-1">
                        Include FY Prefix
                        {cfg.include_fy_prefix && activeFyName && (
                          <span className="font-mono text-primary font-semibold">({activeFyName})</span>
                        )}
                      </Label>
                    </div>
                    <div className="text-xs text-right">
                      <span className="text-muted-foreground mr-1">Start No:</span>
                      <input
                        type="number"
                        min={1}
                        value={cfg.starting_number || 1}
                        onChange={e => handleConfigChange(idx, 'starting_number', e.target.value)}
                        className="w-14 h-6 text-xs text-right font-mono border rounded bg-background px-1"
                        disabled={isGhostMode}
                      />
                    </div>
                  </div>

                  {/* Live Pattern Preview */}
                  <div className="bg-muted/40 border border-border/50 rounded-lg p-2 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1 font-sans">
                      <Sparkles className="h-3 w-3 text-primary" /> Format Preview:
                    </span>
                    <span className="font-mono font-semibold text-primary">{renderLivePreview(cfg)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </SettingPageLayout>
  );
};

export default VoucherSequence;
