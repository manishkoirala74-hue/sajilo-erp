import React, { useState, useMemo } from 'react';
import { useUserPreferencesStore } from '@/store/userPreferencesStore';
import { MASTER_QUICK_ACTIONS } from '@/constants/masterQuickActions';
import { buildNavGroups } from '@/components/layout/Sidebar';
import { getFlattenedSettingsIndex } from '@/pages/settings/config/settingsNavConfig';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trash2, GripVertical, Check, ChevronsUpDown, Search } from 'lucide-react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import * as Icons from 'lucide-react';

export default function QuickActionsSettings() {
  const { quickActions, addQuickAction, removeQuickAction } = useUserPreferencesStore();
  const [open, setOpen] = useState(false);

  // Group the available actions by category, filtering out ones already added
  const availableActionsByCategory = useMemo(() => {
    // Generate universal navigation items
    const sidebarItems = buildNavGroups(null).flatMap(group => 
      group.items.flatMap(item => item.isSubGroup ? item.items : [item])
    );
    const settingsItems = getFlattenedSettingsIndex();

    const universalNav = [
      ...sidebarItems.map(item => {
        // Simple logic to categorize sidebar items based on path
        let category = 'Navigation';
        if (item.path.startsWith('/reports')) category = 'Reports';
        else if (item.path.startsWith('/accounting') || item.path.startsWith('/finance')) category = 'Finance & Accounting';
        else if (item.path.startsWith('/inventory') || item.path.startsWith('/manufacturing')) category = 'Inventory & Operations';
        else if (item.path.startsWith('/sales') || item.path.startsWith('/purchase')) category = 'Sales & Purchases';

        return {
          id: `NAV_${item.path}`,
          type: 'ROUTE',
          target: item.path,
          label: item.label,
          iconComponent: item.icon,
          category,
          keywords: []
        };
      }),
      ...settingsItems.map(setting => ({
        id: `SET_${setting.id}`,
        type: 'ROUTE',
        target: setting.path,
        label: `Settings: ${setting.label}`,
        icon: 'Settings',
        category: 'Settings',
        keywords: setting.keywords || []
      }))
    ];

    // Combine with master quick actions (modals, explicit routes)
    // Filter out duplicates based on target to prevent a route from appearing twice
    const allActions = [...MASTER_QUICK_ACTIONS];
    const existingTargets = new Set(MASTER_QUICK_ACTIONS.filter(a => a.type === 'ROUTE').map(a => a.target));
    
    for (const nav of universalNav) {
      if (!existingTargets.has(nav.target)) {
        allActions.push(nav);
        existingTargets.add(nav.target);
      }
    }

    // Filter out actions that are already in the user's quickActions list
    const activeTargets = new Set(quickActions.map(a => a.target));
    const activeIds = new Set(quickActions.map(a => a.id));
    const available = allActions.filter(a => !activeTargets.has(a.target) && !activeIds.has(a.id));
    
    return available.reduce((acc, action) => {
      const cat = action.category || 'Other';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(action);
      return acc;
    }, {});
  }, [quickActions]);

  const hasMaxItems = quickActions.length >= 10;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Quick Actions Menu</h2>
        <p className="text-muted-foreground mt-2">
          Customize the shortcuts that appear at the top of your Command Palette (Ctrl+K).
          You can pin up to 10 items for rapid access.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pinned Actions ({quickActions.length}/10)</CardTitle>
          <CardDescription>
            These actions are instantly available when you open the Command Palette.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {quickActions.map((action, index) => {
              const IconComponent = Icons[action.icon] || Icons.FileText;
              return (
                <div key={action.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-border group">
                  <div className="flex items-center gap-3">
                    <div className="text-muted-foreground opacity-50 cursor-grab hover:opacity-100">
                      <GripVertical className="h-4 w-4" />
                    </div>
                    <div className="p-2 bg-primary/10 rounded-md">
                      <IconComponent className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium leading-none">{action.label}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {action.type === 'ROUTE' ? 'Navigation Route' : 'Popup Modal'}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:bg-destructive/10"
                    onClick={() => removeQuickAction(action.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
            
            {quickActions.length === 0 && (
              <div className="text-center py-8 text-muted-foreground border-2 border-dashed border-border rounded-lg">
                No quick actions pinned yet.
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-border">
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={open}
                  className="w-full justify-between"
                  disabled={hasMaxItems}
                >
                  {hasMaxItems ? "Maximum of 10 items reached" : "Add a new action..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search reports and forms..." />
                  <CommandList>
                    <CommandEmpty>No actions found.</CommandEmpty>
                    {Object.entries(availableActionsByCategory).map(([category, actions]) => (
                      <CommandGroup key={category} heading={category}>
                        {actions.map((action) => {
                          const IconComponent = action.iconComponent || Icons[action.icon] || Icons.FileText;
                          return (
                            <CommandItem
                              key={action.id}
                              value={`${action.label} ${action.keywords?.join(' ')}`}
                              onSelect={() => {
                                addQuickAction(action);
                                setOpen(false);
                              }}
                              className="flex items-center gap-2 cursor-pointer"
                            >
                              <IconComponent className="h-4 w-4 text-muted-foreground" />
                              <span className="flex-1">{action.label}</span>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
