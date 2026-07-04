import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { SETTINGS_CATEGORIES } from '../config/settingsNavConfig';
import SettingsSearch from './SettingsSearch';

const SettingsCategoryNav = ({ activeCategory }) => {

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 sticky top-0 bg-card z-10 border-b border-border/50">
        <h2 className="text-lg font-semibold mb-4">Settings</h2>
        <SettingsSearch />
      </div>

      <nav className="flex-1 overflow-y-auto p-4 space-y-2">
        {SETTINGS_CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const isActive = activeCategory === cat.id;

          return (
            <NavLink
              key={cat.id}
              to={cat.path}
              className={() =>
                `flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all duration-200 ${
                  isActive
                    ? 'bg-gradient-to-r from-primary to-primary/90 text-primary-foreground shadow-md'
                    : 'text-foreground hover:bg-muted hover:shadow-sm'
                }`
              }
            >
              <Icon className={`w-5 h-5 ${isActive ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
              <span className="font-medium text-sm">{cat.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
};

export default SettingsCategoryNav;
