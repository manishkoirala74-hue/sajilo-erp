import { cn } from '@/lib/utils';

const statusStyles = {
  // Generic
  Draft: 'bg-slate-100 text-slate-600',
  Active: 'bg-emerald-100 text-emerald-700',
  Inactive: 'bg-slate-100 text-slate-500',
  Cancelled: 'bg-red-100 text-red-600',

  // Purchase / Sales Order
  'Pending Approval': 'bg-amber-100 text-amber-700',
  Approved: 'bg-emerald-100 text-emerald-700',
  Billed: 'bg-blue-100 text-blue-700',
  Confirmed: 'bg-blue-100 text-blue-700',
  Preparing: 'bg-orange-100 text-orange-700',
  Ready: 'bg-teal-100 text-teal-700',
  Dispatched: 'bg-purple-100 text-purple-700',
  Delivered: 'bg-emerald-100 text-emerald-700',

  // Invoice status
  Posted: 'bg-blue-100 text-blue-700',
  Unpaid: 'bg-amber-100 text-amber-700',
  Partial: 'bg-orange-100 text-orange-700',
  Paid: 'bg-emerald-100 text-emerald-700',

  // Partner
  true: 'bg-emerald-100 text-emerald-700',
  false: 'bg-slate-100 text-slate-500',
};

export default function StatusBadge({ status, className }) {
  const style = statusStyles[status] || 'bg-slate-100 text-slate-600';
  return (
    <span className={cn(
      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
      style,
      className
    )}>
      {status?.toString()}
    </span>
  );
}