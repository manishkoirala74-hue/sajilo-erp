import React from 'react';
import { useWorkspace } from '@/lib/WorkspaceContext';

export const DateFormatProvider = ({ children }) => {
  return <>{children}</>;
};

export const useDateFormat = () => {
  const workspace = useWorkspace();
  return {
    dateFormat: workspace.dateFormat,
    displayBsDate: workspace.displayBsDate,
    toggleDateFormat: workspace.toggleDateFormat,
    formatDate: workspace.formatDate,
    formatDateForExport: workspace.formatDateForExport,
  };
};