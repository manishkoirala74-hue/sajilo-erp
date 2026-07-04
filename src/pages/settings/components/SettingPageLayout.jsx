import React, { Suspense } from 'react';
import { useSettingsStore } from '@/store/settingsStore';

const SettingPageLayout = ({ title, description, children, onSave, onCancel, isLoading, hideActionBar }) => {
  const hasUnsavedChanges = useSettingsStore(state => state.hasUnsavedChanges());

  return (
    <div className="flex flex-col h-full relative">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="text-muted-foreground mt-1">{description}</p>}
      </div>

      <hr className="border-border mb-6" />

      {/* Configuration Cards Wrapper */}
      <div className="flex-1 max-w-[960px] pb-24">
        {isLoading ? (
          <div className="space-y-4">
            <div className="w-full h-32 bg-muted/50 animate-pulse rounded-2xl" />
            <div className="w-full h-48 bg-muted/50 animate-pulse rounded-2xl" />
          </div>
        ) : (
          <Suspense fallback={<div className="w-full h-32 bg-muted/50 animate-pulse rounded-2xl" />}>
            {children}
          </Suspense>
        )}
      </div>

      {/* Sticky Action Bar */}
      {!hideActionBar && (
        <div className="fixed bottom-0 right-0 left-[520px] p-4 bg-background/80 backdrop-blur-sm border-t border-border flex justify-end gap-3 z-10 transition-transform duration-300 transform translate-y-0 shadow-lg">
        <div className="max-w-[960px] w-full flex justify-end gap-3 mx-auto pr-6">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={!hasUnsavedChanges}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium transition-colors disabled:opacity-50"
          >
            Save Changes
          </button>
        </div>
      </div>
      )}
    </div>
  );
};

export default SettingPageLayout;
