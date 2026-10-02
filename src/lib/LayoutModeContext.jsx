import React, { createContext, useContext, useState } from 'react';

export const LayoutModeContext = createContext({ documentMode: false, setDocumentMode: () => {} });

export function useLayoutMode() {
  return useContext(LayoutModeContext);
}

export function LayoutModeProvider({ children }) {
  const [documentMode, setDocumentMode] = useState(false);
  
  return (
    <LayoutModeContext.Provider value={{ documentMode, setDocumentMode }}>
      {children}
    </LayoutModeContext.Provider>
  );
}
