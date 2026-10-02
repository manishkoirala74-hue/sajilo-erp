import React from 'react';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { Navigate, useLocation } from 'react-router-dom';

export default function DocumentGuard({ children, requireDraft = false }) {
  const { activeCompany } = useWorkspace();
  const location = useLocation();

  if (!activeCompany?.id) {
    return <div className="p-8 text-center text-muted-foreground">Loading workspace...</div>;
  }

  // Force remount of the entire document form if the company tenant changes mid-session.
  // This physically destroys the DOM and all state of the form to prevent data leakage.
  return (
    <React.Fragment key={activeCompany.id}>
      {children}
    </React.Fragment>
  );
}
