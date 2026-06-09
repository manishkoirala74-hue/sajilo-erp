import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  X, Receipt, Plus, FileText, Banknote, UserCheck, SlidersHorizontal 
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function QuickCreateModal({ isOpen, onClose }) {
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleAction = (path) => {
    navigate(path);
    onClose();
  };

  const quickActions = [
    { label: 'New Sales Invoice', path: '/sales/invoices/new', icon: Receipt },
    { label: 'New Cash/Bank Voucher', path: '/treasury/vouchers/new', icon: Banknote },
    { label: 'New Journal Entry', path: '/accounting/general-ledger/new', icon: FileText },
    { label: 'New Customer', path: '/partners/customers/new', icon: UserCheck },
    { label: 'New Supplier', path: '/partners/suppliers/new', icon: UserCheck },
    { label: 'New Stock Adjustment', path: '/inventory/adjustments/new', icon: SlidersHorizontal },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-sidebar w-full max-w-md rounded-xl shadow-2xl border border-slate-700/50 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-700/50">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Plus className="w-5 h-5 text-primary" />
            Quick Create
          </h2>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-1 rounded-md hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4 grid grid-cols-1 gap-2">
          {quickActions.map((action, idx) => (
            <button
              key={idx}
              onClick={() => handleAction(action.path)}
              className="flex items-center gap-3 w-full text-left p-3 rounded-lg hover:bg-sidebar-hover text-slate-300 hover:text-white transition-colors group border border-transparent hover:border-slate-700"
            >
              <div className="w-8 h-8 rounded-md bg-slate-800/50 flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-colors">
                <action.icon className="w-4 h-4" />
              </div>
              <span className="font-medium text-sm">{action.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
