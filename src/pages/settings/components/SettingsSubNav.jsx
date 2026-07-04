import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useSettingsStore } from '@/store/settingsStore';
import { Circle } from 'lucide-react';

import { SETTINGS_SUB_CATEGORIES } from '../config/settingsNavConfig';

const SettingsSubNav = ({ category }) => {
  const items = SETTINGS_SUB_CATEGORIES[category] || [];
  const location = useLocation();
  const subCategory = location.pathname.split('/')[3];
  const hasUnsavedChanges = useSettingsStore(state => state.hasUnsavedChanges());

  if (items.length === 0) return null;

  return (
    <div className="flex flex-col h-full py-4">
      <div className="px-4 mb-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {category} Settings
        </h3>
      </div>
      <nav className="flex-1 space-y-1 px-2">
        {items.map((item) => {
          const isActive = subCategory === item.id;
          // In a real scenario, we might track dirty state per subcategory
          // For now, if there's unsaved changes and this is the active tab, we show it
          const isDirty = isActive && hasUnsavedChanges;

          return (
            <NavLink
              key={item.id}
              to={item.path}
              className={() =>
                `flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-foreground hover:bg-muted'
                }`
              }
            >
              <span>{item.label}</span>
              {isDirty && (
                <Circle className="w-2 h-2 fill-yellow-500 text-yellow-500" />
              )}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
};

export default SettingsSubNav;
