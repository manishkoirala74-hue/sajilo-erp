import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { FileText, Receipt, Wallet, Banknote, UserCheck, Truck, Boxes, BookOpen } from 'lucide-react';

const defaultActions = [
  { id: 'sales_invoice', icon: 'FileText', label: 'Sales Invoice', path: '/sales/invoices?new=1', color: 'bg-blue-500/10 text-blue-500' },
  { id: 'purchase_bill', icon: 'Receipt', label: 'Purchase Bill', path: '/purchase/invoices?new=1', color: 'bg-green-500/10 text-green-500' },
  { id: 'receipt', icon: 'Wallet', label: 'Receipt', path: '/treasury/vouchers?new=1&type=Receipt', color: 'bg-emerald-500/10 text-emerald-500' },
  { id: 'payment', icon: 'Banknote', label: 'Payment', path: '/treasury/vouchers?new=1&type=Payment', color: 'bg-rose-500/10 text-rose-500' },
  { id: 'journal', icon: 'BookOpen', label: 'Journal Voucher', path: '/treasury/vouchers?new=1&type=Journal', color: 'bg-purple-500/10 text-purple-500' },
  { id: 'customer', icon: 'UserCheck', label: 'Customer', path: '/partners/customers?new=1', color: 'bg-indigo-500/10 text-indigo-500' },
  { id: 'supplier', icon: 'Truck', label: 'Supplier', path: '/partners/suppliers?new=1', color: 'bg-orange-500/10 text-orange-500' },
  { id: 'item', icon: 'Boxes', label: 'Item', path: '/inventory/items?new=1', color: 'bg-cyan-500/10 text-cyan-500' },
];

export const useQuickActionsStore = create(
  persist(
    (set) => ({
      pinnedActions: defaultActions,
      setPinnedActions: (actions) => set({ pinnedActions: actions })
    }),
    {
      name: 'sajilo-quick-actions',
      version: 1
    }
  )
);
