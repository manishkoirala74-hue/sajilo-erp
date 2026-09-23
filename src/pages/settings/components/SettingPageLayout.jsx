import React, { Suspense } from 'react';
import { Lock } from 'lucide-react';
import { useSettingsStore } from '@/store/settingsStore';
import { useAuth } from '@/lib/AuthContext';

/**
 * Shared layout wrapper for all Settings pages.
 *
 * Enforces write guards:
 * - Non-admin users see a read-only view with a contact-admin banner.
 * - The Save/Cancel action bar is hidden entirely for non-admins
 *   (DEVELOPMENT_CHECKLIST §2 — Prune Dead UI Elements).
 * - Banner is paired with isLoadingAuth to prevent UI flicker
 *   (DEVELOPMENT_CHECKLIST §2 — Guard UI Banners with Loading States).
 */
const SettingPageLayout = ({ title, description, children, onSave, onCancel, isLoading, hideActionBar }) => {
  const hasUnsavedChanges = useSettingsStore((state) => state.hasUnsavedChanges());
  const { user, isLoadingAuth } = useAuth();

  // Resolve admin status only after auth has settled to prevent flickering
  const isAdmin =
    !isLoadingAuth &&
    (user?.is_tenant_admin === true ||
      user?.role === 'admin' ||
      user?.role === 'owner' ||
      user?.role === 'tenant_admin');

  return (
    <div className="flex flex-col h-full relative">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="text-muted-foreground mt-1">{description}</p>}

        {/* Read-only banner — guarded by isLoadingAuth to prevent flicker */}
        {!isLoadingAuth && !isAdmin && (
          <div className="mt-3 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <Lock className="h-3.5 w-3.5 shrink-0" />
            <span>
              These settings are managed by your company administrator. Contact your admin to request
              changes.
            </span>
          </div>
        )}
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
            {/* Wrap children in pointer-events-none for non-admins */}
            {!isAdmin ? <div className="pointer-events-none opacity-75">{children}</div> : children}
          </Suspense>
        )}
      </div>

      {/* Sticky Action Bar — hidden entirely for non-admins (Prune Dead UI Elements) */}
      {!hideActionBar && isAdmin && (
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
