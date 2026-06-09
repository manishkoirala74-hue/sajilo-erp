import { useState } from 'react';
import { Plus, X, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const DEFAULT_CATEGORIES = ['IT Equipment', 'Vehicles', 'Furniture', 'Machinery', 'Buildings', 'Other'];
const DEFAULT_EVENT_TYPES = ['Insurance', 'Government Tax', 'Preventative Maintenance', 'Safety Inspection', 'License Renewal'];

function TagManager({ title, icon: Icon, items, onAdd, onRemove, placeholder }) {
  const [newItem, setNewItem] = useState('');

  const add = () => {
    const val = newItem.trim();
    if (!val) return;
    if (items.includes(val)) return;
    onAdd(val);
    setNewItem('');
  };

  return (
    <div className="bg-white border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border bg-muted/20">
        <Icon className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-foreground text-sm">{title}</h3>
        <span className="ml-auto text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{items.length} items</span>
      </div>
      <div className="p-5 space-y-4">
        <div className="flex flex-wrap gap-2">
          {items.map(item => (
            <span key={item} className="inline-flex items-center gap-1.5 bg-primary/10 text-primary border border-primary/20 rounded-full px-3 py-1 text-sm font-medium">
              {item}
              <button onClick={() => onRemove(item)} className="hover:text-destructive transition-colors">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {items.length === 0 && (
            <p className="text-sm text-muted-foreground italic">No items yet. Add one below.</p>
          )}
        </div>
        <div className="flex gap-2">
          <Input
            value={newItem}
            onChange={e => setNewItem(e.target.value)}
            placeholder={placeholder}
            className="flex-1"
            onKeyDown={e => e.key === 'Enter' && add()}
          />
          <Button onClick={add} size="sm" disabled={!newItem.trim()}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Add
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Press Enter or click Add. Click × on a tag to remove it.</p>
      </div>
    </div>
  );
}

export default function AssetSettings({ settings, onChange }) {
  const categories = settings?.asset_categories?.length
    ? settings.asset_categories
    : [...DEFAULT_CATEGORIES];

  const eventTypes = settings?.compliance_event_types?.length
    ? settings.compliance_event_types
    : [...DEFAULT_EVENT_TYPES];

  const addCategory = (val) => onChange('asset_categories', [...categories, val]);
  const removeCategory = (val) => onChange('asset_categories', categories.filter(c => c !== val));

  const addEventType = (val) => onChange('compliance_event_types', [...eventTypes, val]);
  const removeEventType = (val) => onChange('compliance_event_types', eventTypes.filter(e => e !== val));

  return (
    <div className="space-y-5">
      <TagManager
        title="Compliance Event Types"
        icon={Calendar}
        items={eventTypes}
        onAdd={addEventType}
        onRemove={removeEventType}
        placeholder="e.g. Environmental Audit…"
      />
    </div>
  );
}