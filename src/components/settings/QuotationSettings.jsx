import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { FileText, Palette, AlignLeft } from 'lucide-react';

function SectionCard({ title, icon: Icon, children }) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border bg-muted/20">
        <Icon className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-foreground text-sm">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export default function QuotationSettings({ settings, onChange }) {
  const s = settings || {};
  const set = (k, v) => onChange(k, v);

  return (
    <div className="space-y-5">
      {/* Numbering */}
      <SectionCard title="Quotation Numbering" icon={FileText}>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label>Quotation Prefix</Label>
            <Input value={s.quotation_prefix || 'QT'} onChange={e => set('quotation_prefix', e.target.value)}
              className="mt-1 font-mono" placeholder="QT" />
            <p className="text-xs text-muted-foreground mt-1">e.g. QT-2026-001</p>
          </div>
          <div>
            <Label>Common Suffix (optional)</Label>
            <Input value={s.quotation_suffix || ''} onChange={e => set('quotation_suffix', e.target.value)}
              className="mt-1 font-mono" placeholder="-NP" />
          </div>
          <div>
            <Label>Next Number</Label>
            <Input type="number" min={1} value={s.quotation_next_number || 1}
              onChange={e => set('quotation_next_number', Number(e.target.value))} className="mt-1" />
          </div>
        </div>
        <div className="mt-4 bg-muted/40 rounded-lg px-4 py-3 text-xs font-mono text-muted-foreground">
          Example: {s.quotation_prefix || 'QT'}-{new Date().getFullYear()}-{String(s.quotation_next_number || 1).padStart(3, '0')}{s.quotation_suffix || ''}
        </div>
      </SectionCard>

      {/* Defaults */}
      <SectionCard title="Quotation Defaults" icon={FileText}>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Default Validity (days)</Label>
            <Input type="number" min={1} value={s.quotation_validity_days || 30}
              onChange={e => set('quotation_validity_days', Number(e.target.value))} className="mt-1" />
            <p className="text-xs text-muted-foreground mt-1">Valid-until date is auto-set from this</p>
          </div>
          <div>
            <Label>Default Template Style</Label>
            <Select value={s.quotation_template || 'modern'} onValueChange={v => set('quotation_template', v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="modern">Modern (Clean & Branded)</SelectItem>
                <SelectItem value="classic">Classic (Traditional)</SelectItem>
                <SelectItem value="minimal">Minimal (Simple)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Primary Accent Colour</Label>
            <div className="flex items-center gap-2 mt-1">
              <input type="color" value={s.quotation_accent_color || '#6366f1'}
                onChange={e => set('quotation_accent_color', e.target.value)}
                className="w-10 h-9 border border-input rounded-md cursor-pointer" />
              <Input value={s.quotation_accent_color || '#6366f1'}
                onChange={e => set('quotation_accent_color', e.target.value)}
                className="font-mono flex-1" placeholder="#6366f1" />
            </div>
          </div>
          <div>
            <Label>Font Family</Label>
            <Select value={s.quotation_font || 'inter'} onValueChange={v => set('quotation_font', v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="inter">Inter (Sans-serif)</SelectItem>
                <SelectItem value="georgia">Georgia (Serif)</SelectItem>
                <SelectItem value="mono">Monospace</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-4 space-y-1">
          <div className="flex items-center justify-between py-2.5 border-b border-border">
            <div>
              <p className="text-sm font-medium">Show Company Logo on Print</p>
              <p className="text-xs text-muted-foreground">Requires company logo set under Organization</p>
            </div>
            <Switch checked={s.quotation_show_logo !== false} onCheckedChange={v => set('quotation_show_logo', v)} />
          </div>
          <div className="flex items-center justify-between py-2.5 border-b border-border">
            <div>
              <p className="text-sm font-medium">Show VAT Breakdown</p>
            </div>
            <Switch checked={s.quotation_show_vat !== false} onCheckedChange={v => set('quotation_show_vat', v)} />
          </div>
          <div className="flex items-center justify-between py-2.5 border-b border-border">
            <div>
              <p className="text-sm font-medium">Show Item Codes</p>
            </div>
            <Switch checked={s.quotation_show_item_codes !== false} onCheckedChange={v => set('quotation_show_item_codes', v)} />
          </div>
          <div className="flex items-center justify-between py-2.5">
            <div>
              <p className="text-sm font-medium">Show Unit Price Column</p>
            </div>
            <Switch checked={s.quotation_show_unit_price !== false} onCheckedChange={v => set('quotation_show_unit_price', v)} />
          </div>
        </div>
      </SectionCard>

      {/* Default Texts */}
      <SectionCard title="Default Text Blocks" icon={AlignLeft}>
        <div className="space-y-4">
          <div>
            <Label>Default Quotation Notes (printed on document)</Label>
            <textarea
              className="w-full mt-1 h-24 border border-input rounded-md px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={s.quotation_default_notes || ''}
              onChange={e => set('quotation_default_notes', e.target.value)}
              placeholder="e.g. Prices are valid for the period stated above. All prices are exclusive of VAT unless stated otherwise."
            />
          </div>
          <div>
            <Label>Default Terms & Conditions</Label>
            <textarea
              className="w-full mt-1 h-28 border border-input rounded-md px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={s.quotation_default_terms || ''}
              onChange={e => set('quotation_default_terms', e.target.value)}
              placeholder="e.g. Payment due within 30 days. Goods remain the property of the seller until full payment is received."
            />
          </div>
          <div>
            <Label>Salutation / Header Line (printed below company name)</Label>
            <Input value={s.quotation_salutation || ''} onChange={e => set('quotation_salutation', e.target.value)}
              className="mt-1" placeholder="e.g. QUOTATION / PROFORMA INVOICE" />
          </div>
        </div>
      </SectionCard>

      {/* Column Design */}
      <SectionCard title="Print Layout Options" icon={Palette}>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Paper Size</Label>
            <Select value={s.quotation_paper_size || 'A4'} onValueChange={v => set('quotation_paper_size', v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="A4">A4</SelectItem>
                <SelectItem value="Letter">US Letter</SelectItem>
                <SelectItem value="A5">A5 (Half-page)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Orientation</Label>
            <Select value={s.quotation_orientation || 'portrait'} onValueChange={v => set('quotation_orientation', v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="portrait">Portrait</SelectItem>
                <SelectItem value="landscape">Landscape</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}