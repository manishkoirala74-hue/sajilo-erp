import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { toast } from 'sonner';

export type ActionType = 'MODAL' | 'ROUTE';

export interface QuickAction {
  id: string;
  type: ActionType;
  target: string;
  label: string;
  icon: string;
}

interface UserPreferencesState {
  quickActions: QuickAction[];
  setQuickActions: (actions: QuickAction[]) => void;
  addQuickAction: (action: QuickAction) => void;
  removeQuickAction: (id: string) => void;
}

export const defaultQuickActions: QuickAction[] = [
  { id: 'CREATE_CUST', type: 'MODAL', target: 'CREATE_CUSTOMER', label: 'New Customer', icon: 'UserCheck' },
  { id: 'CREATE_SUPP', type: 'MODAL', target: 'CREATE_SUPPLIER', label: 'New Supplier', icon: 'UserCheck' },
  { id: 'CREATE_SI', type: 'ROUTE', target: '/sales/invoices?new=1', label: 'New Sales Invoice', icon: 'Receipt' },
  { id: 'CREATE_CBV', type: 'ROUTE', target: '/treasury/vouchers/new', label: 'New Cash/Bank Voucher', icon: 'Banknote' },
  { id: 'CREATE_JE', type: 'ROUTE', target: '/treasury/vouchers?new=1&type=Journal', label: 'New Journal Entry', icon: 'FileText' },
  { id: 'CREATE_SA', type: 'ROUTE', target: '/inventory/adjustments/new', label: 'New Stock Adjustment', icon: 'SlidersHorizontal' },
  { id: 'REP_GL', type: 'ROUTE', target: '/reports?report=ledger_detail', label: 'Detail General Ledger', icon: 'BookOpen' },
];

export const useUserPreferencesStore = create<UserPreferencesState>()(
  persist(
    (set) => ({
      quickActions: defaultQuickActions,

      setQuickActions: (actions) => set({ quickActions: actions }),
      
      addQuickAction: (action) => set((state) => {
        if (state.quickActions.length >= 10) {
          toast.error("Maximum limit of 10 Quick Actions reached. Please remove an existing action before adding a new one.");
          return state; // No change
        }
        return {
          quickActions: [...state.quickActions, action]
        };
      }),

      removeQuickAction: (id) => set((state) => ({
        quickActions: state.quickActions.filter((a) => a.id !== id)
      })),
    }),
    {
      name: 'sajilo-user-preferences', // unique name for localStorage
    }
  )
);
