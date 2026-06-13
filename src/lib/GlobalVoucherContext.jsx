import React, { createContext, useContext, useState, useCallback } from 'react';

const GlobalVoucherContext = createContext();

export function GlobalVoucherDrawerProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeVoucherNumber, setActiveVoucherNumber] = useState(null);

  const openVoucher = useCallback((voucherNumber) => {
    setActiveVoucherNumber(voucherNumber);
    setIsOpen(true);
  }, []);

  const closeVoucher = useCallback(() => {
    setIsOpen(false);
    // Add a small delay before clearing the number so the slide-out animation finishes smoothly
    setTimeout(() => setActiveVoucherNumber(null), 300);
  }, []);

  return (
    <GlobalVoucherContext.Provider value={{ isOpen, activeVoucherNumber, openVoucher, closeVoucher }}>
      {children}
    </GlobalVoucherContext.Provider>
  );
}

export function useGlobalVoucherDrawer() {
  const context = useContext(GlobalVoucherContext);
  if (!context) {
    throw new Error('useGlobalVoucherDrawer must be used within a GlobalVoucherDrawerProvider');
  }
  return context;
}
