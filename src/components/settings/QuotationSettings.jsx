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
              className="h-10 border border-border bg-background px-3 text-sm rounded-md focus:ring-1 focus:ring-primary outline-none mt-1 font-mono" placeholder="QT" />
            <p className="mt-1 text-xs text-muted-foreground ">e.g. QT-2026-001</p>
          </div>
          <div>
            <Label>Common Suffix (optional)</Label>
            <Input value={s.quotation_suffix || ''} onChange={e => set('quotation_suffix', e.target.value)}
              className="h-10 border border-border bg-background px-3 text-sm rounded-md focus:ring-1 focus:ring-primary outline-none mt-1 font-mono" placeholder="-NP" />
          </div>
          <div>
            <Label>Next Number</Label>
            <Input type="number" min={1} value={s.quotation_next_number || 1}
              onChange={e => set('quotation_next_number', Number(e.target.value))} className="h-10 border border-border bg-background px-3 text-sm rounded-md focus:ring-1 focus:ring-primary outline-none mt-1 font-mono text-right" />
          </div>
        </div>
        <div className="mt-4 bg-muted/40 rounded-lg px-4 py-3 text-xs font-mono text-muted-foreground">
          Example: {s.quotation_prefix || 'QT'}-{new Date().getFullYear()}-{String(s.quotation_next_number || 1).padStart(3, '0')}{s.quotation_suffix || ''}
        </div>
      </SectionCard>


    </div>
  );
}