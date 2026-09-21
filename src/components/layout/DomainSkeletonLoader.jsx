import React from 'react';

export default function DomainSkeletonLoader() {
  return (
    <div className="w-full h-full flex flex-col gap-4 animate-pulse">
      {/* Top action bar skeleton */}
      <div className="flex items-center justify-between py-2">
        <div className="h-8 bg-muted rounded w-1/4"></div>
        <div className="flex gap-2">
          <div className="h-9 w-24 bg-muted rounded"></div>
          <div className="h-9 w-24 bg-primary/20 rounded"></div>
        </div>
      </div>
      
      {/* Filters/Tabs skeleton */}
      <div className="h-12 w-full bg-muted/50 rounded-lg border border-border mt-2"></div>
      
      {/* Data grid/list skeleton */}
      <div className="flex-1 w-full bg-card rounded-xl border border-border mt-4 p-4 flex flex-col gap-4">
        <div className="flex justify-between border-b border-border pb-4">
          <div className="h-5 bg-muted rounded w-32"></div>
          <div className="h-5 bg-muted rounded w-24"></div>
          <div className="h-5 bg-muted rounded w-24 hidden md:block"></div>
          <div className="h-5 bg-muted rounded w-16"></div>
        </div>
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="flex justify-between py-2">
            <div className="h-4 bg-muted rounded w-1/3"></div>
            <div className="h-4 bg-muted/70 rounded w-20"></div>
            <div className="h-4 bg-muted/70 rounded w-24 hidden md:block"></div>
            <div className="h-4 bg-muted rounded w-12"></div>
          </div>
        ))}
      </div>
    </div>
  );
}
