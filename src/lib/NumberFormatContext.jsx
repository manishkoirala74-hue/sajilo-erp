import React from 'react';
import { useWorkspace } from '@/lib/WorkspaceContext';

export const NumberFormatProvider = ({ children }) => {
  return <>{children}</>;
};

export const useNumberFormat = () => {
  const workspace = useWorkspace();
  return {
    numberSystem: workspace.numberSystem,
    toggleNumberSystem: workspace.toggleNumberSystem,
  };
};
