import React from 'react';

export const SettingsSkeletonLoader = () => {
  return (
    <div 
      className="space-y-6 animate-pulse"
      role="status"
      aria-label="Loading configuration"
    >
      {/* Screen-reader only text */}
      <span className="sr-only">Loading settings configuration...</span>

      {/* Title Bar (Add aria-hidden so screen readers ignore the visual blocks) */}
      <div className="flex justify-between items-center pb-4 border-b" aria-hidden="true">
        <div className="h-6 bg-muted/60 rounded w-48" />
        <div className="h-8 bg-muted/60 rounded w-24" />
      </div>
      
      {/* Form Fields */}
      <div className="space-y-8" aria-hidden="true">
        {[1, 2, 3].map((section) => (
          <div key={section} className="space-y-4">
            <div className="h-5 bg-muted/40 rounded w-32 mb-4" />
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <div className="h-4 bg-muted/40 rounded w-24" />
                <div className="h-10 bg-muted/40 rounded w-full" />
              </div>
              <div className="space-y-2">
                <div className="h-4 bg-muted/40 rounded w-28" />
                <div className="h-10 bg-muted/40 rounded w-full" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
