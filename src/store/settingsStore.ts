import { create } from 'zustand';
import { isEqual } from 'lodash';

interface SettingsState {
  serverSettings: any;
  draftSettings: any;
  setServerSettings: (settings: any) => void;
  updateDraftSettings: (settings: any) => void;
  resetDraft: () => void;
  hasUnsavedChanges: () => boolean;
}

export const DEFAULT_SETTINGS = {
  company_name: 'My Company', currency: 'NPR', address: '', phone: '', email: '',
  tax_id: '', vat_rate: 13, tax_charge_type: 'Exclusive', default_payment_term_days: 30,
  fiscal_year_start: '2026-04-01', date_format: 'AD',
  enable_purchase_orders: true, enable_approvals: true, approval_limit_amount: 50000, enable_landed_costs: false,
  item_image_max_size_mb: 2, item_image_max_count: 3,
  invoice_prefix_sales: 'SI', invoice_prefix_purchase: 'PI',
  invoice_prefix_sales_order: 'SO', invoice_prefix_purchase_order: 'PO',
  invoice_suffix: '', invoice_next_number: 1, include_fy_in_invoice_number: true,
  invoice_numbering_method: 'Auto', invoice_duplicate_handling: 'Block',
  show_recent_trading_history: true,
  overdue_reminder_days: 7, send_invoice_reminder_on_due: true, self_reminder_days_before_due: 3,
  email_smtp_host: '', email_smtp_port: 587, email_smtp_user: '', email_smtp_password: '', email_from_name: '',
  email_debtor_template: 'Dear {customer_name},\n\nThis is a reminder that invoice {invoice_number} for NPR {amount} is due on {due_date}.\n\nPlease make the payment at your earliest convenience.\n\nRegards,\n{company_name}',
  opening_balance_date: '',
  enable_pos_module: true, enable_manufacturing_module: true, enable_hr_module: true,
  enable_assets_module: true, enable_services_module: true,
  dep_default_method: 'Straight-Line', dep_default_rate_percent: 20,
  dep_use_rate_override: false, dep_posting_mode: 'Accumulated',
  dep_factory_expense_account_id: '', dep_factory_expense_account_name: '',
  dep_admin_expense_account_id: '', dep_admin_expense_account_name: '',
  dep_accumulated_machinery_account_id: '', dep_accumulated_machinery_account_name: '',
  dep_accumulated_office_account_id: '', dep_accumulated_office_account_name: '',
  dep_accumulated_vehicle_account_id: '', dep_accumulated_vehicle_account_name: '',
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  serverSettings: {},
  draftSettings: {},
  
  setServerSettings: (settings) => set({ 
    serverSettings: settings, 
    draftSettings: settings // On load, drafts match server
  }),
  
  updateDraftSettings: (newSettings) => set((state) => ({
    draftSettings: { ...state.draftSettings, ...newSettings }
  })),

  resetDraft: () => set((state) => ({
    draftSettings: { ...state.serverSettings }
  })),

  hasUnsavedChanges: () => {
    const { serverSettings, draftSettings } = get();
    return !isEqual(serverSettings, draftSettings);
  }
}));
