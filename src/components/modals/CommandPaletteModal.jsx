import { Command } from 'cmdk';
import { useUserPreferencesStore } from '@/store/userPreferencesStore';
import { useModalStore } from '@/store/modalStore';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import * as Icons from 'lucide-react';
import { useEffect, useState, useMemo } from 'react';
import { buildNavGroups } from '../layout/Sidebar';
import { getFlattenedSettingsIndex } from '@/pages/settings/config/settingsNavConfig';

export default function CommandPaletteModal({ open, onOpenChange }) {
  const { quickActions } = useUserPreferencesStore();
  const { openModal, closeModal } = useModalStore();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const onSelect = (action) => {
    if (action.type === 'MODAL') {
      openModal(action.target);
    } else if (action.type === 'ROUTE') {
      navigate(action.target);
      closeModal();
    }
  };

  const universalNav = useMemo(() => {
    const sidebarItems = buildNavGroups(null).flatMap(group => 
      group.items.flatMap(item => item.isSubGroup ? item.items : [item])
    );
    const settingsItems = getFlattenedSettingsIndex();

    // Combine and format them as ROUTE actions
    const combined = [
      ...sidebarItems.map(item => ({
        id: `NAV_${item.path}`,
        type: 'ROUTE',
        target: item.path,
        label: item.label,
        iconComponent: item.icon,
        keywords: []
      })),
      ...settingsItems.map(setting => ({
        id: `SET_${setting.id}`,
        type: 'ROUTE',
        target: setting.path,
        label: `Settings: ${setting.label}`,
        icon: 'Settings',
        keywords: setting.keywords || []
      }))
    ];

    // Filter out duplicates that are already in quickActions based on target path
    const pinnedTargets = new Set(quickActions.filter(a => a.type === 'ROUTE').map(a => a.target));
    return combined.filter(item => !pinnedTargets.has(item.target));
  }, [quickActions]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 max-w-2xl bg-sidebar border-slate-700/50 shadow-2xl overflow-hidden [&>button]:hidden">
        <Command
          className="flex flex-col w-full bg-transparent text-slate-200"
          label="Command Palette"
          shouldFilter={true}
        >
          <div className="flex items-center px-4 py-3 border-b border-slate-700/50" cmdk-input-wrapper="">
            <Icons.Search className="w-5 h-5 mr-3 text-slate-500 shrink-0" />
            <Command.Input
              value={search}
              onValueChange={setSearch}
              autoFocus
              placeholder="Type a command or search..."
              className="flex-1 bg-transparent outline-none placeholder:text-slate-500 text-slate-200"
            />
            <kbd className="hidden sm:inline-flex items-center gap-1 font-sans text-[10px] bg-slate-800 border border-slate-700 rounded px-1.5 h-6 text-slate-400 font-medium">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-[300px] overflow-y-auto p-2 scrollbar-hide-default">
            <Command.Empty className="py-6 text-center text-sm text-slate-500">
              No results found.
            </Command.Empty>

            <Command.Group heading="Quick Actions" className="text-xs font-medium text-slate-500 px-2 py-1.5 [&_[cmdk-group-items]]:mt-2">
              {quickActions.map((action) => {
                const Icon = Icons[action.icon] || Icons.FileText;
                return (
                  <Command.Item
                    key={action.id}
                    value={`${action.label} ${action.keywords?.join(' ') || ''}`}
                    onSelect={() => onSelect(action)}
                    className="flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg cursor-pointer aria-selected:bg-primary/20 aria-selected:text-primary text-slate-300 hover:text-slate-200 transition-colors group"
                  >
                    <Icon className="w-4 h-4 text-slate-400 group-aria-selected:text-primary" />
                    {action.label}
                  </Command.Item>
                );
              })}
            </Command.Group>
            
            <Command.Group heading="Navigation" className="text-xs font-medium text-slate-500 px-2 py-1.5 [&_[cmdk-group-items]]:mt-2">
              {universalNav.map((action) => {
                const Icon = action.iconComponent || Icons[action.icon] || Icons.FileText;
                return (
                  <Command.Item
                    key={action.id}
                    value={`${action.label} ${action.keywords?.join(' ') || ''}`}
                    onSelect={() => onSelect(action)}
                    className="flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg cursor-pointer aria-selected:bg-primary/20 aria-selected:text-primary text-slate-300 hover:text-slate-200 transition-colors group"
                  >
                    <Icon className="w-4 h-4 text-slate-400 group-aria-selected:text-primary" />
                    {action.label}
                  </Command.Item>
                );
              })}
            </Command.Group>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
