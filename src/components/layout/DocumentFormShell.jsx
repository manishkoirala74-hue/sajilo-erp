import React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export default function DocumentFormShell({ 
  children, 
  title, 
  status,
  onSave, 
  onPost, 
  isSaving, 
  isPosting, 
  actions,
  totals // optional sticky totals component
}) {
  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] relative">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {status && (
            <span className={cn(
              "px-2 py-0.5 rounded text-xs font-medium uppercase tracking-wide",
              status === 'Draft' ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" :
              status === 'Posted' ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" :
              "bg-muted text-muted-foreground"
            )}>
              {status}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {actions}
          <Button variant="outline" onClick={onSave} disabled={isSaving || isPosting}>
            {isSaving ? 'Saving...' : 'Save Draft'}
          </Button>
          <Button onClick={onPost} disabled={isSaving || isPosting} className="min-w-[100px]">
            {isPosting ? 'Posting...' : 'Post'}
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6 relative">
        {children}
      </div>

      {/* Sticky Totals Footer (if provided) */}
      {totals && (
        <div className="sticky bottom-0 left-0 right-0 border-t border-border bg-card/95 backdrop-blur-sm p-4 shrink-0 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] z-20">
          <div className="max-w-[1600px] mx-auto w-full">
            {totals}
          </div>
        </div>
      )}
    </div>
  );
}
