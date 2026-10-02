import { Command } from 'cmdk';
import { useUserPreferencesStore } from '@/store/userPreferencesStore';
import { useModalStore } from '@/store/modalStore';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import * as Icons from 'lucide-react';
import { useEffect, useState, useMemo } from 'react';
import { buildNavGroups } from '../layout/Sidebar';
import { getFlattenedSettingsIndex } from '@/pages/settings/config/settingsNavConfig';
import { useSettingsStore } from '@/store/settingsStore';
import { canAccessRoute, hasPermission } from '@/lib/permissionResolver';
import { useAuth } from '@/lib/AuthContext';
import { getFlattenedReportIndex } from '@/pages/reports/config/reportNavConfig';

export default function CommandPaletteModal({ open, onOpenChange }) {
  const { quickActions } = useUserPreferencesStore();
  const { openModal, closeModal } = useModalStore();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  
  const { user, activeRole, activeCompany } = useAuth();
  const serverSettings = useSettingsStore(state => state.serverSettings);

  const onSelect = (action) => {
    if (action.type === 'MODAL') {
      openModal(action.target);
    } else if (action.type === 'ROUTE') {
      navigate(action.target);
      closeModal();
    }
  };

  // 1. Operational Routes (Sidebar)
  const operationalNav = useMemo(() => {
    return buildNavGroups(serverSettings)
      .flatMap(group => group.items.flatMap(item => item.isSubGroup ? item.items : [item]))
      .filter(item => canAccessRoute(item.path, user, activeRole, null, activeCompany))
      .map(item => ({ ...item, type: 'ROUTE', id: `NAV_${item.path}`, target: item.path, iconComponent: item.icon }));
  }, [serverSettings, user, activeRole, activeCompany]);

  // 2. Report Routes
  const reportNav = useMemo(() => {
    return getFlattenedReportIndex()
      .filter(report => !report.permissionKey || hasPermission({ user, activeCompany, activeRole, permissionKey: report.permissionKey }))
      .map(item => ({ ...item, type: 'ROUTE', id: `REP_${item.path}`, target: item.path, icon: item.icon }));
  }, [user, activeCompany, activeRole]);

  // 3. Settings Routes
  const settingsNav = useMemo(() => {
    return getFlattenedSettingsIndex()
      .filter(s => !s.permissionKey || hasPermission({ user, activeCompany, activeRole, permissionKey: s.permissionKey }))
      .map(item => ({ ...item, type: 'ROUTE', id: `SET_${item.path}`, target: item.path, icon: 'Settings' }));
  }, [user, activeCompany, activeRole]);

  // Determine React-level Search Mode (for dataset swapping and dedup)
  const isSettingsMode = search.startsWith('>');
  const isSearching = search.trim().length > 0;

  // Secure quick actions against role changes
  const secureQuickActions = useMemo(() => {
    return quickActions.filter(action => 
      action.type !== 'ROUTE' || canAccessRoute(action.target, user, activeRole, null, activeCompany)
    );
  }, [quickActions, user, activeRole, activeCompany]);

  // BUG FIX 1: Only deduplicate when the user is NOT searching. 
  const pinnedTargets = new Set(
    (!isSearching && !isSettingsMode) 
      ? secureQuickActions.filter(a => a.type === 'ROUTE').map(a => a.target) 
      : []
  );

  // React handles swapping the dataset to feed the correct items to CMDK
  const displayedNavigationItems = useMemo(() => {
    const sourceList = isSettingsMode ? settingsNav : [...operationalNav, ...reportNav];
    return sourceList.filter(item => !pinnedTargets.has(item.target));
  }, [isSettingsMode, settingsNav, operationalNav, reportNav, pinnedTargets]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 max-w-2xl bg-sidebar border-slate-700/50 shadow-2xl overflow-hidden [&>button]:hidden">
        
        <Command 
           className="flex flex-col w-full bg-transparent text-slate-200" 
           label="Command Palette"
           loop
           shouldFilter={true}
           filter={(itemValue, searchStr) => {
             // BUG FIX 2: Derive the cleaned string INSIDE the filter function
             // using the real-time `searchStr` provided by CMDK.
             // This completely eliminates React render-cycle race conditions.
             const isSettings = searchStr.startsWith('>');
             const activeSearch = isSettings ? searchStr.substring(1).trim() : searchStr;
             
             if (!activeSearch) return 1;
             
             return itemValue.toLowerCase().includes(activeSearch.toLowerCase()) ? 1 : 0;
           }}
        >
          <div className="flex items-center px-4 py-3 border-b border-slate-700/50" cmdk-input-wrapper="">
            <Icons.Search className="w-5 h-5 mr-3 text-slate-500 shrink-0" />
            <Command.Input
              value={search}
              onValueChange={setSearch}
              autoFocus
              placeholder="Search or jump to... (Type > for settings)"
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

            {/* Quick Actions - Only show if NOT in settings mode and NO active search */}
            {!isSettingsMode && !isSearching && secureQuickActions.length > 0 && (
              <Command.Group heading="Quick Actions" className="text-xs font-medium text-slate-500 px-2 py-1.5 [&_[cmdk-group-items]]:mt-2">
                {secureQuickActions.map((action) => {
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
            )}
            
            {/* Main Navigation (or Settings) Group */}
            <Command.Group heading={isSettingsMode ? "Settings" : "Navigation"} className="text-xs font-medium text-slate-500 px-2 py-1.5 [&_[cmdk-group-items]]:mt-2">
              {displayedNavigationItems.map((action) => {
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
